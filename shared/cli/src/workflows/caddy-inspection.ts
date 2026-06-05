import { buildSharedServiceProfile } from '../config/shared-service-profile.js';
import { buildCaddyOverview, type CaddyRouteOverview, type CaddySubjectOverview } from '../config/caddy-config.js';
import type { CliContext } from '../context/create-context.js';
import { buildDomains } from '../config/build-config.js';
import { buildPorts } from '../context/ports.js';
import { listActiveInstanceManifests, listActiveRouteManifests, type InstanceManifest, type RouteManifest } from '../runtime/manifest-store.js';
import { CaddyService } from '../services/definitions/caddy-service.js';
import * as docker from '../services/docker.js';

export type CaddyInspection = {
    routeGroups: CaddyRouteGroup[];
    subjects: Array<CaddySubjectOverview & { live: CaddyLiveState }>;
    liveReachable: boolean;
    adminUrl: string;
};

export type CaddyLiveState = 'configured' | 'missing' | 'unavailable';

export type CaddyRouteGroup = {
    label: string;
    order: number;
    routes: Array<CaddyRouteOverview & { live: CaddyLiveState }>;
};

type LiveCaddyConfig = {
    apps?: {
        http?: {
            servers?: Record<string, { routes?: Array<{ match?: Array<{ host?: string[] }>; handle?: Array<{ upstreams?: Array<{ dial?: string }> }> }> }>;
        };
        tls?: {
            automation?: {
                policies?: Array<{ subjects?: string[] }>;
            };
        };
    };
};

export async function inspectCaddy(context: CliContext): Promise<CaddyInspection> {
    const profile = buildSharedServiceProfile(await getRuntime());
    const overview = await buildCaddyOverview(context, { proxyHost: profile.caddyProxyHost });
    const [activeInstances, activeRoutes] = await Promise.all([listActiveInstanceManifests(context), listActiveRouteManifests(context)]);
    const live = await fetchLiveCaddyConfig();
    const liveRoutes = live ? liveRouteKeys(live) : new Set<string>();
    const liveSubjects = live ? liveSubjectKeys(live) : new Set<string>();

    return {
        adminUrl: CaddyService.adminUrl(),
        liveReachable: live !== undefined,
        routeGroups: buildRouteGroups(context, profile.caddyProxyHost, activeInstances, activeRoutes, live, liveRoutes),
        subjects: overview.subjects.map(subject => ({
            ...subject,
            live: liveState(live, [subject.subject], liveSubjects),
        })),
    };
}

function buildRouteGroups(context: CliContext, proxyHost: string, activeInstances: InstanceManifest[], activeRoutes: RouteManifest[], live: LiveCaddyConfig | undefined, liveRoutes: Set<string>): CaddyRouteGroup[] {
    const groups: CaddyRouteGroup[] = [
        {
            label: 'Shared services',
            order: 10,
            routes: sharedServiceRoutes(context, proxyHost).map(route => addLiveState(route, live, liveRoutes)),
        },
    ];

    const sortedInstances = [...activeInstances].sort((a, b) => a.rootPath.localeCompare(b.rootPath) || a.workspace.localeCompare(b.workspace) || a.env.localeCompare(b.env));
    for (const instance of sortedInstances) {
        groups.push({
            label: instanceGroupLabel(context, instance),
            order: instance.rootPath === context.rootDir ? 20 : 30,
            routes: instanceRoutes(instance, proxyHost).map(route => addLiveState(route, live, liveRoutes)),
        });
    }

    const hasCurrentInstance = activeInstances.some(instance => instance.name === context.instance.name && instance.rootPath === context.rootDir);
    if (!hasCurrentInstance) {
        groups.push({
            label: `Current workspace - ${context.env} (not registered)`,
            order: 40,
            routes: currentContextRoutes(context, proxyHost).map(route => addLiveState(route, live, liveRoutes)),
        });
    }

    const playwrightRoutes = activeRoutes.filter(manifest => manifest.kind === 'playwright-worker');
    for (const manifest of playwrightRoutes) {
        groups.push({
            label: `Playwright worker - ${manifest.name}`,
            order: 50,
            routes: manifest.routes.map(route => routeOverview(route.hosts, route.port, proxyHost, 'playwright worker')).map(route => addLiveState(route, live, liveRoutes)),
        });
    }

    return groups.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

function addLiveState(route: CaddyRouteOverview, live: LiveCaddyConfig | undefined, liveRoutes: Set<string>): CaddyRouteOverview & { live: CaddyLiveState } {
    return {
        ...route,
        live: liveState(live, route.hosts.map(host => routeKey(host, route.upstream)), liveRoutes),
    };
}

function sharedServiceRoutes(context: CliContext, proxyHost: string): CaddyRouteOverview[] {
    const domains = buildDomains(context);
    const ports = buildPorts(context);
    return [
        routeOverview([domains.mail], ports.maildevHttp, proxyHost, 'shared service'),
        routeOverview([domains.files], ports.rustfs, proxyHost, 'shared service'),
        routeOverview([domains.filesConsole], ports.rustfsConsole, proxyHost, 'shared service'),
    ];
}

function currentContextRoutes(context: CliContext, proxyHost: string): CaddyRouteOverview[] {
    const domains = buildDomains(context);
    const ports = buildPorts(context);
    return appRoutes(domains, ports, proxyHost, 'current instance');
}

function instanceRoutes(instance: InstanceManifest, proxyHost: string): CaddyRouteOverview[] {
    return appRoutes(instance.domains, instance.ports, proxyHost, 'active instance');
}

function appRoutes(domains: InstanceManifest['domains'], ports: InstanceManifest['ports'], proxyHost: string, source: CaddyRouteOverview['source']): CaddyRouteOverview[] {
    return [
        routeOverview([domains.api, `*.${domains.api}`], ports.api, proxyHost, source),
        routeOverview([domains.dashboard], ports.dashboard, proxyHost, source),
        ...(domains.registration ? [routeOverview([domains.registration, `*.${domains.registration}`], ports.registration, proxyHost, source)] : []),
        routeOverview([domains.renderer], ports.renderer, proxyHost, source),
        ...(domains.webshop ? [routeOverview([domains.webshop], ports.webshop, proxyHost, source)] : []),
        routeOverview([domains.sso ?? siblingDomain(domains.dashboard, 'sso')], ports.sso, proxyHost, source),
    ];
}

function siblingDomain(domain: string, label: string): string {
    const [, ...rest] = domain.split('.');
    return [label, ...rest].join('.');
}

function routeOverview(hosts: string[], port: number, proxyHost: string, source: CaddyRouteOverview['source']): CaddyRouteOverview {
    return {
        hosts,
        port,
        upstream: `${proxyHost}:${port}`,
        source,
        sourceOrder: 0,
    };
}

function instanceGroupLabel(context: CliContext, instance: InstanceManifest): string {
    const scope = instance.rootPath === context.rootDir ? 'Current workspace' : instance.workspace;
    return `${scope} - ${instance.env}`;
}

async function getRuntime(): Promise<docker.ContainerRuntime> {
    try {
        return await docker.getContainerRuntime();
    }
    catch {
        return docker.ContainerRuntime.Docker;
    }
}

async function fetchLiveCaddyConfig(): Promise<LiveCaddyConfig | undefined> {
    try {
        const res = await CaddyService.fetchAdmin('/config/', { signal: AbortSignal.timeout(1_000) });
        if (!res.ok) {
            return undefined;
        }
        return await res.json() as LiveCaddyConfig;
    }
    catch {
        return undefined;
    }
}

function liveRouteKeys(config: LiveCaddyConfig): Set<string> {
    const keys = new Set<string>();
    const servers = config.apps?.http?.servers ?? {};
    for (const server of Object.values(servers)) {
        for (const route of server.routes ?? []) {
            const upstream = route.handle?.find(handle => handle.upstreams)?.upstreams?.[0]?.dial;
            if (!upstream) {
                continue;
            }
            for (const match of route.match ?? []) {
                for (const host of match.host ?? []) {
                    keys.add(routeKey(host, upstream));
                }
            }
        }
    }
    return keys;
}

function liveSubjectKeys(config: LiveCaddyConfig): Set<string> {
    return new Set(config.apps?.tls?.automation?.policies?.flatMap(policy => policy.subjects ?? []) ?? []);
}

function liveState(config: LiveCaddyConfig | undefined, expectedKeys: string[], liveKeys: Set<string>): CaddyLiveState {
    if (!config) {
        return 'unavailable';
    }
    return expectedKeys.every(key => liveKeys.has(key)) ? 'configured' : 'missing';
}

function routeKey(host: string, upstream: string): string {
    return `${host}->${upstream}`;
}
