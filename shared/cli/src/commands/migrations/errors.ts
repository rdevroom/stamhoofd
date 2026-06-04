export function improveImageConflictError(error: unknown, replacementFlag: '--tag' | '--tag-prefix'): never {
    if (error instanceof Error) {
        const match = /^Image already exists: (.+)$/.exec(error.message);
        if (match) {
            throw new Error(`Image tag already exists: ${match[1]}. Choose a different ${replacementFlag} and rerun the command.`);
        }
    }
    throw error;
}
