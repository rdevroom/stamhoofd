
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `_event_notifications_events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `_event_notifications_events` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `event_notificationsId` varchar(36) NOT NULL,
  `eventsId` varchar(36) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `event_notificationsId` (`event_notificationsId`),
  KEY `eventsId` (`eventsId`),
  CONSTRAINT `event_notificationsId` FOREIGN KEY (`event_notificationsId`) REFERENCES `event_notifications` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `eventsId` FOREIGN KEY (`eventsId`) REFERENCES `events` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `_members_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `_members_users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `membersId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `usersId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  KEY `membersId` (`membersId`),
  KEY `usersId` (`usersId`),
  CONSTRAINT `_members_users_ibfk_1` FOREIGN KEY (`membersId`) REFERENCES `members` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `_members_users_ibfk_2` FOREIGN KEY (`usersId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=140735 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` varchar(36) NOT NULL DEFAULT '',
  `externalId` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `source` varchar(36) NOT NULL,
  `type` varchar(36) NOT NULL,
  `organizationId` varchar(36) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `objectId` varchar(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `description` text,
  `replacements` json NOT NULL,
  `meta` json NOT NULL DEFAULT (_utf8mb4'{"value": {}, "version": 0}'),
  `patchList` json NOT NULL,
  `createdAt` datetime NOT NULL,
  PRIMARY KEY (`id` DESC),
  UNIQUE KEY `externalId` (`externalId`) USING BTREE,
  KEY `createdAt` (`createdAt` DESC) USING BTREE,
  KEY `objectId` (`objectId`,`createdAt` DESC) USING BTREE,
  KEY `organizationId` (`organizationId`),
  KEY `userId` (`userId`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `audit_logs_ibfk_2` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `balance_item_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `balance_item_payments` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '',
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `balanceItemId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `paymentId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `price` bigint NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`),
  KEY `balanceItemId` (`balanceItemId`),
  KEY `paymentId` (`paymentId`),
  CONSTRAINT `balance_item_payments_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `balance_item_payments_ibfk_2` FOREIGN KEY (`balanceItemId`) REFERENCES `balance_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `balance_item_payments_ibfk_3` FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `balance_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `balance_items` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '',
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `registrationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `userId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `memberId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `packageId` varchar(36) DEFAULT NULL,
  `orderId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `unitPrice` bigint NOT NULL DEFAULT '0',
  `VATPercentage` int DEFAULT NULL,
  `VATIncluded` tinyint NOT NULL DEFAULT '1',
  `VATExcempt` varchar(36) DEFAULT NULL,
  `pricePaid` bigint NOT NULL DEFAULT '0',
  `pricePending` bigint NOT NULL DEFAULT '0',
  `priceOpen` bigint NOT NULL DEFAULT '0',
  `priceInvoiced` int NOT NULL DEFAULT '0',
  `priceTotal` bigint NOT NULL DEFAULT '0',
  `status` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `startDate` datetime DEFAULT NULL,
  `endDate` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `payingOrganizationId` varchar(36) DEFAULT NULL,
  `dependingBalanceItemId` varchar(36) DEFAULT NULL,
  `amount` int NOT NULL DEFAULT '1',
  `type` varchar(36) NOT NULL DEFAULT 'Other',
  `relations` json NOT NULL DEFAULT (_utf8mb4'{"value": {}, "version": 0}'),
  `dueAt` datetime DEFAULT NULL,
  `paidAt` datetime DEFAULT NULL,
  `failedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`),
  KEY `registrationId` (`registrationId`),
  KEY `userId` (`userId`),
  KEY `memberId` (`memberId`),
  KEY `orderId` (`orderId`),
  KEY `payingOrganizationId` (`payingOrganizationId`),
  KEY `dependingBalanceItemId` (`dependingBalanceItemId`),
  KEY `packageId` (`packageId`),
  CONSTRAINT `balance_items_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `balance_items_ibfk_2` FOREIGN KEY (`registrationId`) REFERENCES `registrations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `balance_items_ibfk_3` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `balance_items_ibfk_4` FOREIGN KEY (`memberId`) REFERENCES `members` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `balance_items_ibfk_5` FOREIGN KEY (`orderId`) REFERENCES `webshop_orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `balance_items_ibfk_6` FOREIGN KEY (`payingOrganizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `balance_items_ibfk_7` FOREIGN KEY (`dependingBalanceItemId`) REFERENCES `balance_items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `balance_items_ibfk_8` FOREIGN KEY (`packageId`) REFERENCES `stamhoofd_packages` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `buckaroo_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `buckaroo_payments` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'ascii_general_ci',
  `paymentId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `transactionKey` varchar(54) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `paymentId` (`paymentId`) USING BTREE,
  CONSTRAINT `buckaroo_payments_ibfk_1` FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cached_outstanding_balances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cached_outstanding_balances` (
  `id` varchar(36) NOT NULL DEFAULT '',
  `objectId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `objectType` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `amountPaid` bigint NOT NULL DEFAULT '0',
  `amountOpen` bigint NOT NULL DEFAULT '0',
  `amountPending` bigint NOT NULL DEFAULT '0',
  `nextDueAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `lastReminderEmail` datetime DEFAULT NULL,
  `lastReminderAmountOpen` bigint NOT NULL DEFAULT '0',
  `reminderEmailCount` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `objectId` (`organizationId`,`objectId`,`objectType`) USING BTREE,
  KEY `nextDueAt` (`nextDueAt`) USING BTREE,
  KEY `globalObjectId` (`objectId`,`objectType`) USING BTREE,
  CONSTRAINT `cached_outstanding_balances_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `cities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `cities` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(50) DEFAULT NULL,
  `country` varchar(2) DEFAULT NULL,
  `parentCityId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `provinceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  KEY `provinceId` (`provinceId`),
  KEY `parentCityId` (`parentCityId`),
  FULLTEXT KEY `name` (`name`),
  CONSTRAINT `cities_ibfk_1` FOREIGN KEY (`provinceId`) REFERENCES `provinces` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `cities_ibfk_2` FOREIGN KEY (`parentCityId`) REFERENCES `cities` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `document_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_templates` (
  `id` varchar(36) NOT NULL DEFAULT '',
  `html` longtext NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `status` varchar(36) NOT NULL,
  `settings` json NOT NULL,
  `privateSettings` json NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `updatesEnabled` tinyint(1) NOT NULL DEFAULT '1',
  `year` int NOT NULL DEFAULT '0',
  `publishedAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`),
  CONSTRAINT `document_templates_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `documents` (
  `id` varchar(36) NOT NULL DEFAULT '',
  `data` json NOT NULL,
  `status` varchar(36) NOT NULL,
  `templateId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `registrationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `memberId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `number` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `templateId` (`templateId`),
  KEY `registrationId` (`registrationId`),
  KEY `memberId` (`memberId`),
  CONSTRAINT `documents_ibfk_1` FOREIGN KEY (`templateId`) REFERENCES `document_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `documents_ibfk_2` FOREIGN KEY (`registrationId`) REFERENCES `registrations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `documents_ibfk_3` FOREIGN KEY (`memberId`) REFERENCES `members` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `email_addresses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_addresses` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `markedAsSpam` tinyint(1) DEFAULT NULL,
  `hardBounce` tinyint(1) DEFAULT NULL,
  `unsubscribedMarketing` tinyint(1) DEFAULT NULL,
  `unsubscribedAll` tinyint(1) DEFAULT NULL,
  `token` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`,`organizationId`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `email_recipients`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_recipients` (
  `id` varchar(36) NOT NULL,
  `emailId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `objectId` varchar(36) DEFAULT NULL,
  `userId` varchar(36) DEFAULT NULL,
  `memberId` varchar(36) DEFAULT NULL,
  `organizationId` varchar(36) DEFAULT NULL,
  `hardBounceError` text,
  `softBounceError` text,
  `spamComplaintError` text,
  `emailType` varchar(255) DEFAULT NULL,
  `firstName` varchar(128) DEFAULT NULL,
  `lastName` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `email` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `replacements` json NOT NULL,
  `failErrorMessage` text,
  `failError` json DEFAULT NULL,
  `previousFailError` json DEFAULT NULL,
  `failCount` int NOT NULL DEFAULT '0',
  `firstFailedAt` datetime DEFAULT NULL,
  `lastFailedAt` datetime DEFAULT NULL,
  `sentAt` datetime DEFAULT NULL,
  `updatedAt` datetime NOT NULL,
  `createdAt` datetime NOT NULL,
  `duplicateOfRecipientId` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `emailId` (`emailId`),
  KEY `objectId` (`objectId`,`sentAt` DESC) USING BTREE,
  KEY `organizationId` (`organizationId`),
  KEY `memberId` (`memberId`),
  KEY `userId` (`userId`),
  KEY `duplicateOfRecipientId` (`duplicateOfRecipientId`),
  CONSTRAINT `email_recipients_ibfk_1` FOREIGN KEY (`emailId`) REFERENCES `emails` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `email_recipients_ibfk_2` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `email_recipients_ibfk_3` FOREIGN KEY (`memberId`) REFERENCES `members` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `email_recipients_ibfk_4` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `email_recipients_ibfk_5` FOREIGN KEY (`duplicateOfRecipientId`) REFERENCES `email_recipients` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `email_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_templates` (
  `id` varchar(36) NOT NULL DEFAULT '',
  `subject` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `groupId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `webshopId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `type` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `html` text NOT NULL,
  `json` json NOT NULL,
  `updatedAt` datetime NOT NULL,
  `createdAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`),
  KEY `webshopId` (`webshopId`),
  KEY `groupId` (`groupId`),
  CONSTRAINT `email_templates_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `email_templates_ibfk_2` FOREIGN KEY (`webshopId`) REFERENCES `webshops` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `email_templates_ibfk_3` FOREIGN KEY (`groupId`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `email_verification_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `email_verification_codes` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `email` varchar(255) NOT NULL,
  `code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `token` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `createdAt` datetime NOT NULL,
  `expiresAt` datetime NOT NULL,
  `generatedCount` int unsigned NOT NULL DEFAULT '0',
  `tries` int unsigned NOT NULL DEFAULT '0',
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `userId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  UNIQUE KEY `userId` (`userId`) USING BTREE,
  UNIQUE KEY `token` (`token`) USING BTREE,
  KEY `organizationId` (`organizationId`),
  CONSTRAINT `email_verification_codes_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `email_verification_codes_ibfk_2` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `emails`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `emails` (
  `id` varchar(36) NOT NULL DEFAULT '',
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `senderId` varchar(36) DEFAULT NULL,
  `userId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `recipientFilter` json NOT NULL,
  `emailType` varchar(255) DEFAULT NULL,
  `subject` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `text` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `html` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci,
  `json` json NOT NULL,
  `status` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `emailErrors` json DEFAULT NULL,
  `recipientsStatus` varchar(255) NOT NULL,
  `recipientsErrors` json DEFAULT NULL,
  `attachments` json NOT NULL,
  `sentAt` datetime DEFAULT NULL,
  `updatedAt` datetime NOT NULL,
  `deletedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `fromAddress` text,
  `emailRecipientsCount` int DEFAULT NULL,
  `otherRecipientsCount` int DEFAULT NULL,
  `membersCount` int NOT NULL DEFAULT '0',
  `failedCount` int NOT NULL DEFAULT '0',
  `softFailedCount` int NOT NULL DEFAULT '0',
  `hardBouncesCount` int NOT NULL DEFAULT '0',
  `softBouncesCount` int NOT NULL DEFAULT '0',
  `spamComplaintsCount` int NOT NULL DEFAULT '0',
  `succeededCount` int NOT NULL DEFAULT '0',
  `fromName` text,
  `sendAsEmail` tinyint(1) NOT NULL DEFAULT '1',
  `showInMemberPortal` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`),
  KEY `userId` (`userId`),
  KEY `createdAt` (`createdAt` DESC) USING BTREE,
  KEY `sentAt` (`sentAt` DESC) USING BTREE,
  CONSTRAINT `emails_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `emails_ibfk_2` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `event_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `event_notifications` (
  `id` varchar(36) NOT NULL DEFAULT '',
  `typeId` varchar(36) NOT NULL,
  `periodId` varchar(36) NOT NULL,
  `startDate` datetime NOT NULL,
  `endDate` datetime NOT NULL,
  `status` varchar(36) NOT NULL,
  `feedbackText` text,
  `organizationId` varchar(36) DEFAULT NULL,
  `recordAnswers` json NOT NULL DEFAULT (_utf8mb4'{"value": {}, "version": 0}'),
  `acceptedRecordAnswers` json NOT NULL DEFAULT (_utf8mb4'{"value": {}, "version": 0}'),
  `createdBy` varchar(36) DEFAULT NULL,
  `submittedBy` varchar(36) DEFAULT NULL,
  `submittedAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`),
  KEY `periodId` (`periodId`),
  KEY `createdBy` (`createdBy`),
  KEY `submittedBy` (`submittedBy`),
  KEY `startDate` (`startDate`) USING BTREE,
  KEY `submittedAt` (`submittedAt` DESC) USING BTREE,
  CONSTRAINT `createdBy` FOREIGN KEY (`createdBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `organizationId` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `periodId` FOREIGN KEY (`periodId`) REFERENCES `registration_periods` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `submittedBy` FOREIGN KEY (`submittedBy`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `id` varchar(36) NOT NULL DEFAULT '',
  `typeId` varchar(36) NOT NULL,
  `name` text NOT NULL,
  `startDate` datetime NOT NULL,
  `endDate` datetime NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `groupId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `webshopId` varchar(36) DEFAULT NULL,
  `meta` json NOT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`),
  KEY `groupId` (`groupId`),
  KEY `startDate` (`startDate`) USING BTREE,
  KEY `webshopId` (`webshopId`),
  KEY `idx_org_startdate` (`organizationId`,`startDate`),
  CONSTRAINT `events_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `events_ibfk_2` FOREIGN KEY (`groupId`) REFERENCES `groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `events_ibfk_3` FOREIGN KEY (`webshopId`) REFERENCES `webshops` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `groups` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `type` varchar(36) NOT NULL DEFAULT 'Membership',
  `settings` json NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `cycle` int NOT NULL DEFAULT '0' COMMENT 'Increased every time a new registration period started',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `privateSettings` json NOT NULL DEFAULT (json_object()),
  `deletedAt` datetime DEFAULT NULL,
  `status` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'Open',
  `defaultAgeGroupId` varchar(36) DEFAULT NULL,
  `waitingListId` varchar(36) DEFAULT NULL,
  `periodId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `stockReservations` json NOT NULL DEFAULT (_utf8mb4'{"value": [], "version": 0}'),
  PRIMARY KEY (`id`),
  UNIQUE KEY `groupCycle` (`cycle`,`id`) USING BTREE,
  KEY `organizationId` (`organizationId`),
  KEY `periodId` (`periodId`),
  KEY `waitingListId` (`waitingListId`),
  CONSTRAINT `groups_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `groups_ibfk_2` FOREIGN KEY (`periodId`) REFERENCES `registration_periods` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `groups_ibfk_3` FOREIGN KEY (`waitingListId`) REFERENCES `groups` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `images`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `images` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `source` json NOT NULL,
  `createdAt` datetime NOT NULL,
  `resolutions` json NOT NULL DEFAULT (json_array()),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `invoiced_balance_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoiced_balance_items` (
  `id` varchar(36) NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `invoiceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `balanceItemId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `balanceInvoicedAmount` int NOT NULL,
  `quantity` int NOT NULL,
  `unitPrice` int NOT NULL,
  `VATPercentage` int NOT NULL,
  `VATIncluded` tinyint(1) NOT NULL,
  `VATExcempt` varchar(36) DEFAULT NULL,
  `totalWithoutVAT` int NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`),
  KEY `invoiceId` (`invoiceId`),
  KEY `balanceItemId` (`balanceItemId`),
  CONSTRAINT `invoiced_balance_items_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `invoiced_balance_items_ibfk_2` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `invoiced_balance_items_ibfk_3` FOREIGN KEY (`balanceItemId`) REFERENCES `balance_items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `invoices` (
  `id` varchar(36) NOT NULL,
  `number` varchar(36) DEFAULT NULL,
  `customer` json NOT NULL,
  `seller` json NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `payingOrganizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `payableRoundingAmount` int NOT NULL,
  `VATTotal` json NOT NULL,
  `VATTotalAmount` int NOT NULL,
  `totalWithoutVAT` int NOT NULL,
  `totalBalanceInvoicedAmount` int NOT NULL,
  `totalWithVAT` int NOT NULL,
  `ipAddress` varchar(36) DEFAULT NULL,
  `userAgent` varchar(36) DEFAULT NULL,
  `stripeAccountId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `reference` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `pdf` json DEFAULT NULL,
  `xml` json DEFAULT NULL,
  `negativeInvoiceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `didSendPeppol` tinyint(1) NOT NULL DEFAULT '0',
  `invoicedAt` datetime DEFAULT NULL,
  `dueAt` datetime DEFAULT NULL,
  `updatedAt` datetime NOT NULL,
  `createdAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `number` (`organizationId`,`number`) USING BTREE,
  KEY `negativeInvoiceId` (`negativeInvoiceId`),
  KEY `payingOrganizationId` (`payingOrganizationId`),
  CONSTRAINT `invoices_ibfk_1` FOREIGN KEY (`negativeInvoiceId`) REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `invoices_ibfk_2` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `invoices_ibfk_3` FOREIGN KEY (`payingOrganizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `member_platform_memberships`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `member_platform_memberships` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '',
  `memberId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `membershipTypeId` varchar(36) NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `periodId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `startDate` datetime NOT NULL,
  `trialUntil` datetime DEFAULT NULL,
  `endDate` datetime NOT NULL,
  `expireDate` datetime DEFAULT NULL,
  `balanceItemId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT '',
  `price` int NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `deletedAt` datetime DEFAULT NULL,
  `updatedAt` datetime NOT NULL,
  `generated` tinyint NOT NULL DEFAULT '0',
  `maximumFreeAmount` int NOT NULL DEFAULT '1',
  `freeAmount` int NOT NULL DEFAULT '0',
  `priceWithoutDiscount` int NOT NULL DEFAULT '0',
  `locked` tinyint NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `memberId` (`memberId`),
  KEY `organizationId` (`organizationId`),
  KEY `periodId` (`periodId`),
  KEY `balanceItemId` (`balanceItemId`),
  KEY `idx_memberships_lookup` (`memberId`,`deletedAt`,`startDate`,`endDate`),
  CONSTRAINT `member_platform_memberships_ibfk_1` FOREIGN KEY (`memberId`) REFERENCES `members` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `member_platform_memberships_ibfk_2` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `member_platform_memberships_ibfk_3` FOREIGN KEY (`periodId`) REFERENCES `registration_periods` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `member_platform_memberships_ibfk_4` FOREIGN KEY (`balanceItemId`) REFERENCES `balance_items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `member_responsibility_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `member_responsibility_records` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '',
  `memberId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `groupId` varchar(36) DEFAULT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `responsibilityId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `startDate` datetime NOT NULL,
  `endDate` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `responsibilityId` (`responsibilityId`) USING BTREE,
  KEY `memberId,organizationId` (`memberId`,`organizationId`) USING BTREE,
  KEY `organizationId` (`organizationId`),
  KEY `groupId` (`groupId`),
  CONSTRAINT `member_responsibility_records_ibfk_1` FOREIGN KEY (`memberId`) REFERENCES `members` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `member_responsibility_records_ibfk_2` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `member_responsibility_records_ibfk_3` FOREIGN KEY (`groupId`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `members` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `firstName` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `lastName` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `birthDay` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `details` json NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `outstandingBalance` int NOT NULL DEFAULT '0',
  `memberNumber` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `order_by_name` (`firstName`,`lastName`,`id`) USING BTREE,
  UNIQUE KEY `order_by_name_desc` (`firstName` DESC,`lastName` DESC,`id` DESC) USING BTREE,
  UNIQUE KEY `order_by_birth_day` (`birthDay`,`id`) USING BTREE,
  UNIQUE KEY `order_by_birth_day_desc` (`birthDay` DESC,`id` DESC) USING BTREE,
  UNIQUE KEY `memberNumber_organizationId` (`memberNumber`,`organizationId`) USING BTREE,
  KEY `organizationId` (`organizationId`),
  CONSTRAINT `members_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `merged_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `merged_members` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `firstName` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `lastName` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `birthDay` varchar(10) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `details` json NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `outstandingBalance` int NOT NULL DEFAULT '0',
  `memberNumber` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `mergedToId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `mergedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`),
  KEY `mergedToId` (`mergedToId`),
  CONSTRAINT `merged_members_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `merged_members_ibfk_2` FOREIGN KEY (`mergedToId`) REFERENCES `members` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `migrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `migrations` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `file` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `executedOn` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  UNIQUE KEY `file` (`file`) USING BTREE
) ENGINE=InnoDB AUTO_INCREMENT=239 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `mollie_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mollie_payments` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'ascii_general_ci',
  `paymentId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `mollieId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `paymentId` (`paymentId`) USING BTREE,
  CONSTRAINT `mollie_payments_ibfk_1` FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `mollie_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mollie_tokens` (
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `accessToken` text,
  `refreshToken` text,
  `createdAt` datetime NOT NULL,
  `expiresOn` datetime DEFAULT NULL,
  PRIMARY KEY (`organizationId`),
  UNIQUE KEY `organizationId` (`organizationId`),
  CONSTRAINT `mollie_tokens_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organization_registration_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `organization_registration_periods` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `periodId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `settings` json NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `setupSteps` json NOT NULL DEFAULT (_utf8mb4'{"value": {}, "version": 0}'),
  PRIMARY KEY (`id`),
  UNIQUE KEY `organizationId,periodId` (`organizationId`,`periodId`) USING BTREE,
  KEY `periodId` (`periodId`),
  CONSTRAINT `organization_registration_periods_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `organization_registration_periods_ibfk_2` FOREIGN KEY (`periodId`) REFERENCES `registration_periods` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `organizations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `organizations` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `uri` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `registerDomain` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `website` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `meta` json NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `address` json NOT NULL,
  `searchIndex` text CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `privateMeta` json NOT NULL DEFAULT (json_object()),
  `serverMeta` json NOT NULL DEFAULT (json_object()),
  `periodId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uri` (`uri`) USING BTREE,
  UNIQUE KEY `registerDomain` (`registerDomain`) USING BTREE,
  KEY `periodId` (`periodId`),
  KEY `tags` ((cast(json_extract(`meta`,_utf8mb4'$.value.tags') as char(36) array))) USING BTREE,
  FULLTEXT KEY `searchIndex` (`searchIndex`),
  CONSTRAINT `organizations_ibfk_1` FOREIGN KEY (`periodId`) REFERENCES `registration_periods` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `password_tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_tokens` (
  `token` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `validUntil` datetime NOT NULL,
  `userId` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `createdAt` datetime NOT NULL,
  PRIMARY KEY (`token`),
  KEY `userId` (`userId`),
  CONSTRAINT `password_tokens_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payconiq_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payconiq_payments` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'ascii_general_ci',
  `paymentId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `payconiqId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `paymentId` (`paymentId`) USING BTREE,
  CONSTRAINT `payconiq_payments_ibfk_1` FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payments` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `type` varchar(36) NOT NULL DEFAULT 'Payment',
  `settlement` json DEFAULT NULL,
  `iban` varchar(40) DEFAULT NULL,
  `ibanName` varchar(128) DEFAULT NULL,
  `method` varchar(36) DEFAULT NULL,
  `provider` varchar(36) DEFAULT NULL,
  `status` varchar(36) NOT NULL,
  `price` bigint NOT NULL DEFAULT '0',
  `refundedAmount` bigint NOT NULL DEFAULT '0',
  `roundingAmount` int NOT NULL DEFAULT '0',
  `paidAt` datetime DEFAULT NULL,
  `transferSettings` json DEFAULT NULL,
  `transferDescription` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `adminUserId` varchar(36) DEFAULT NULL,
  `payingUserId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `freeContribution` int DEFAULT NULL,
  `stripeAccountId` varchar(36) DEFAULT NULL,
  `mandateId` varchar(36) DEFAULT NULL,
  `createMandate` json DEFAULT NULL,
  `serviceFeeManualCharged` int NOT NULL DEFAULT '0',
  `serviceFeeManual` int NOT NULL DEFAULT '0',
  `serviceFeePayout` int NOT NULL DEFAULT '0',
  `transferFee` int NOT NULL DEFAULT '0',
  `transferFeeManual` int NOT NULL DEFAULT '0',
  `transferFeeManualCharged` int NOT NULL DEFAULT '0',
  `payingOrganizationId` varchar(36) DEFAULT NULL,
  `customer` json DEFAULT NULL,
  `invoiceId` varchar(36) DEFAULT NULL,
  `reversingPaymentId` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `createdAt` (`createdAt`) USING BTREE,
  KEY `organizationId` (`organizationId`),
  KEY `userId` (`payingUserId`),
  KEY `stripeAccountId` (`stripeAccountId`),
  KEY `payingOrganizationId` (`payingOrganizationId`),
  KEY `invoiceId` (`invoiceId`),
  KEY `reversingPaymentId` (`reversingPaymentId`),
  KEY `adminUserId` (`adminUserId`),
  CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`payingUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_3` FOREIGN KEY (`payingOrganizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_4` FOREIGN KEY (`invoiceId`) REFERENCES `invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_5` FOREIGN KEY (`reversingPaymentId`) REFERENCES `payments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `payments_ibfk_6` FOREIGN KEY (`adminUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `stripeAccountId` FOREIGN KEY (`stripeAccountId`) REFERENCES `stripe_accounts` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `platform`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `platform` (
  `id` varchar(36) NOT NULL DEFAULT '',
  `privateConfig` json NOT NULL,
  `config` json NOT NULL,
  `serverConfig` json NOT NULL DEFAULT (_utf8mb4'{"value": {}, "version": 0}'),
  `periodId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `previousPeriodId` varchar(36) DEFAULT NULL,
  `nextPeriodId` varchar(36) DEFAULT NULL,
  `membershipOrganizationId` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `periodId` (`periodId`),
  KEY `membershipOrganizationId` (`membershipOrganizationId`),
  KEY `previousPeriodId` (`previousPeriodId`),
  KEY `nextPeriodId` (`nextPeriodId`),
  CONSTRAINT `platform_ibfk_1` FOREIGN KEY (`periodId`) REFERENCES `registration_periods` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `platform_ibfk_2` FOREIGN KEY (`membershipOrganizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `platform_ibfk_3` FOREIGN KEY (`previousPeriodId`) REFERENCES `registration_periods` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `platform_ibfk_4` FOREIGN KEY (`nextPeriodId`) REFERENCES `registration_periods` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `postal_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `postal_codes` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `postalCode` varchar(36) NOT NULL,
  `cityId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `country` varchar(2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `postalCode` (`postalCode`,`country`) USING BTREE,
  KEY `cityId` (`cityId`),
  CONSTRAINT `postal_codes_ibfk_1` FOREIGN KEY (`cityId`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `provinces`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `provinces` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `country` varchar(2) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  FULLTEXT KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `register_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `register_codes` (
  `code` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'utf8mb4_unicode_ci',
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `value` int NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `description` varchar(100) NOT NULL,
  `customMessage` varchar(250) DEFAULT NULL,
  `invoiceValue` int DEFAULT NULL,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `registration_invitations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `registration_invitations` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `memberId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `groupId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `createdAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_member_group` (`memberId`,`groupId`),
  KEY `idx_memberId` (`memberId`) USING BTREE,
  KEY `registration_invitations_ibfk_2` (`groupId`),
  KEY `registration_invitations_ibfk_3` (`organizationId`),
  CONSTRAINT `registration_invitations_ibfk_1` FOREIGN KEY (`memberId`) REFERENCES `members` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `registration_invitations_ibfk_2` FOREIGN KEY (`groupId`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `registration_invitations_ibfk_3` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `registration_periods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `registration_periods` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT '',
  `startDate` datetime NOT NULL,
  `endDate` datetime NOT NULL,
  `locked` tinyint NOT NULL DEFAULT '0',
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `settings` json NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `previousPeriodId` varchar(36) DEFAULT NULL,
  `nextPeriodId` varchar(36) DEFAULT NULL,
  `customName` varchar(200) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`),
  KEY `previousPeriodId` (`previousPeriodId`),
  KEY `nextPeriodId` (`nextPeriodId`),
  CONSTRAINT `registration_periods_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `registration_periods_ibfk_2` FOREIGN KEY (`previousPeriodId`) REFERENCES `registration_periods` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `registration_periods_ibfk_3` FOREIGN KEY (`nextPeriodId`) REFERENCES `registration_periods` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `registrations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `registrations` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `payingOrganizationId` varchar(36) DEFAULT NULL,
  `memberId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `groupId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `reservedUntil` datetime DEFAULT NULL,
  `registeredAt` datetime DEFAULT NULL COMMENT 'Date of the registration or renewal. This is null if the registration is not yet active (e.g. during payment)',
  `startDate` datetime DEFAULT NULL,
  `endDate` datetime DEFAULT NULL,
  `trialUntil` datetime DEFAULT NULL,
  `deactivatedAt` datetime DEFAULT NULL COMMENT 'Set if the registration was canceled or deactivated during the group cycle. Keep this null at the end of the group cycle.',
  `cycle` int NOT NULL COMMENT 'Cycle of the group the registration is for',
  `paymentId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `price` int DEFAULT NULL,
  `groupPrice` json NOT NULL DEFAULT (_utf8mb4'{"value": {"id": "unknown", "name": "Onbekend", "price": {"price": 0, "reducedPrice": null}}, "version": 0}'),
  `options` json NOT NULL DEFAULT (_utf8mb4'{"value": [], "version": 0}'),
  `recordAnswers` json NOT NULL DEFAULT (_utf8mb4'{"value": {}, "version": 0}'),
  `waitingList` tinyint(1) NOT NULL DEFAULT '0',
  `canRegister` tinyint(1) NOT NULL DEFAULT '0',
  `sendConfirmationEmail` tinyint(1) NOT NULL DEFAULT '1',
  `pricePaid` int NOT NULL DEFAULT '0',
  `periodId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `stockReservations` json NOT NULL DEFAULT (_utf8mb4'{"value": [], "version": 0}'),
  `discounts` json NOT NULL DEFAULT (_utf8mb4'{"value": {}, "version": 0}'),
  PRIMARY KEY (`id`),
  KEY `memberId` (`memberId`) USING BTREE,
  KEY `paymentId` (`paymentId`),
  KEY `groupOccupancy` (`groupId`,`cycle`,`registeredAt`,`reservedUntil`) USING BTREE,
  KEY `periodId` (`periodId`),
  KEY `organizationId` (`organizationId`),
  KEY `payingOrganizationId` (`payingOrganizationId`),
  CONSTRAINT `registrations_ibfk_1` FOREIGN KEY (`memberId`) REFERENCES `members` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `registrations_ibfk_2` FOREIGN KEY (`groupId`) REFERENCES `groups` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `registrations_ibfk_3` FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `registrations_ibfk_4` FOREIGN KEY (`periodId`) REFERENCES `registration_periods` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `registrations_ibfk_5` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `registrations_ibfk_6` FOREIGN KEY (`payingOrganizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stamhoofd_credits`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stamhoofd_credits` (
  `id` varchar(36) NOT NULL DEFAULT 'utf8mb4_0900_ai_ci',
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'ascii_general_ci',
  `expireAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `description` varchar(255) NOT NULL,
  `allowTransactions` int NOT NULL DEFAULT '0',
  `change` int NOT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`,`createdAt`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stamhoofd_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stamhoofd_invoices` (
  `id` varchar(36) NOT NULL,
  `organizationId` varchar(36) DEFAULT NULL,
  `payingOrganizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `creditId` varchar(36) DEFAULT NULL,
  `paymentId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `meta` json NOT NULL,
  `reference` varchar(128) DEFAULT NULL,
  `number` mediumint DEFAULT NULL,
  `paidAt` datetime DEFAULT NULL,
  `didSendPeppol` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `paymentId` (`paymentId`),
  KEY `reference` (`reference`) USING BTREE,
  KEY `payingOrganizationId` (`payingOrganizationId`) USING BTREE,
  KEY `organizationId` (`organizationId`),
  CONSTRAINT `stamhoofd_invoices_ibfk_1` FOREIGN KEY (`payingOrganizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `stamhoofd_invoices_ibfk_2` FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `stamhoofd_invoices_ibfk_3` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stamhoofd_packages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stamhoofd_packages` (
  `id` varchar(36) NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `meta` json NOT NULL,
  `removeAt` datetime DEFAULT NULL,
  `validUntil` datetime DEFAULT NULL,
  `validAt` datetime DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `emailCount` int NOT NULL DEFAULT '0',
  `lastEmailAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stamhoofd_pending_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stamhoofd_pending_invoices` (
  `id` varchar(36) NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `meta` json NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `invoiceId` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `organizationId` (`organizationId`) USING BTREE,
  KEY `invoiceId` (`invoiceId`),
  CONSTRAINT `stamhoofd_pending_invoices_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `stamhoofd_pending_invoices_ibfk_2` FOREIGN KEY (`invoiceId`) REFERENCES `stamhoofd_invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `streets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `streets` (
  `id` varchar(36) NOT NULL,
  `cityId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  PRIMARY KEY (`id`),
  KEY `cityId` (`cityId`),
  CONSTRAINT `streets_ibfk_1` FOREIGN KEY (`cityId`) REFERENCES `cities` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stripe_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stripe_accounts` (
  `id` varchar(36) NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'ascii_general_ci',
  `status` varchar(32) NOT NULL DEFAULT 'active',
  `accountId` varchar(100) NOT NULL,
  `meta` json NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `organizationId` (`organizationId`),
  CONSTRAINT `stripe_accounts_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stripe_checkout_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stripe_checkout_sessions` (
  `id` varchar(36) NOT NULL,
  `paymentId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `stripeSessionId` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `organizationId` varchar(36) DEFAULT NULL,
  `accountId` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stripeIntentId` (`stripeSessionId`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `stripe_payment_intents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stripe_payment_intents` (
  `id` varchar(36) NOT NULL,
  `paymentId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `stripeIntentId` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `organizationId` varchar(36) DEFAULT NULL,
  `accountId` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `stripeIntentId` (`stripeIntentId`) USING BTREE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tokens`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tokens` (
  `userId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `accessToken` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `refreshToken` varchar(256) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `accessTokenValidUntil` datetime NOT NULL,
  `refreshTokenValidUntil` datetime NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`accessToken`),
  UNIQUE KEY `refreshToken` (`refreshToken`),
  KEY `userId` (`userId`),
  CONSTRAINT `tokens_ibfk_1` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `uitpas_client_credentials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `uitpas_client_credentials` (
  `id` varchar(36) NOT NULL,
  `clientId` varchar(255) NOT NULL,
  `clientSecret` varchar(255) NOT NULL,
  `createdAt` date NOT NULL,
  `updatedAt` datetime NOT NULL,
  `organizationId` varchar(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `organizationId` (`organizationId`),
  CONSTRAINT `fk_uitpas_client_credentials_organization` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `used_register_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `used_register_codes` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `code` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'utf8mb4_unicode_ci',
  `balanceItemId` varchar(36) DEFAULT NULL,
  `creditId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `organizationId` (`organizationId`) USING BTREE,
  KEY `creditId` (`creditId`),
  KEY `code` (`code`),
  KEY `balanceItemId` (`balanceItemId`),
  CONSTRAINT `used_register_codes_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `used_register_codes_ibfk_2` FOREIGN KEY (`creditId`) REFERENCES `stamhoofd_credits` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `used_register_codes_ibfk_3` FOREIGN KEY (`code`) REFERENCES `register_codes` (`code`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `used_register_codes_ibfk_4` FOREIGN KEY (`balanceItemId`) REFERENCES `balance_items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `memberId` varchar(36) DEFAULT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `email` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `password` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `firstName` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `lastName` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `verified` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `organizationPermissions` json DEFAULT NULL,
  `meta` json DEFAULT NULL,
  `permissions` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  UNIQUE KEY `emailOrganizaton` (`email`,`organizationId`) USING BTREE,
  KEY `organizationId` (`organizationId`),
  KEY `memberId` (`memberId`),
  CONSTRAINT `users_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `users_ibfk_2` FOREIGN KEY (`memberId`) REFERENCES `members` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `webshop_discount_codes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `webshop_discount_codes` (
  `id` varchar(36) NOT NULL,
  `description` text NOT NULL,
  `code` varchar(128) NOT NULL,
  `webshopId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `discounts` json NOT NULL,
  `usageCount` bigint unsigned NOT NULL,
  `maximumUsage` bigint unsigned DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`webshopId`,`code`) USING BTREE,
  KEY `organizationId` (`organizationId`),
  CONSTRAINT `webshop_discount_codes_ibfk_1` FOREIGN KEY (`webshopId`) REFERENCES `webshops` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `webshop_discount_codes_ibfk_2` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `webshop_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `webshop_orders` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `data` json NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `webshopId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `paymentId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `validAt` datetime DEFAULT NULL,
  `number` bigint unsigned DEFAULT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `userId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `status` varchar(36) NOT NULL DEFAULT 'Created',
  `totalPrice` bigint DEFAULT NULL,
  `amount` int DEFAULT NULL,
  `timeSlotTime` varchar(8) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id` (`id`),
  UNIQUE KEY `orderNumber` (`number`,`webshopId`) USING BTREE,
  UNIQUE KEY `orderNumberForWebshop` (`webshopId`,`number`) USING BTREE,
  UNIQUE KEY `updatedAt` (`webshopId`,`updatedAt`,`number`) USING BTREE,
  KEY `paymentId` (`paymentId`),
  KEY `webshopId` (`webshopId`),
  KEY `organizationId` (`organizationId`),
  KEY `userId` (`userId`),
  CONSTRAINT `webshop_orders_ibfk_1` FOREIGN KEY (`paymentId`) REFERENCES `payments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `webshop_orders_ibfk_2` FOREIGN KEY (`webshopId`) REFERENCES `webshops` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `webshop_orders_ibfk_3` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `webshop_orders_ibfk_4` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `webshop_tickets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `webshop_tickets` (
  `id` varchar(36) NOT NULL,
  `secret` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `deletedAt` datetime DEFAULT NULL,
  `itemId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `orderId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `webshopId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `scannedAt` datetime DEFAULT NULL,
  `scannedBy` varchar(100) DEFAULT NULL,
  `index` int NOT NULL,
  `seat` json DEFAULT NULL,
  `originalSeat` json DEFAULT NULL,
  `total` int NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `secret` (`secret`,`webshopId`) USING BTREE,
  KEY `organizationId` (`organizationId`),
  KEY `orderId` (`orderId`),
  KEY `updatedAt` (`webshopId`,`updatedAt`) USING BTREE,
  CONSTRAINT `webshop_tickets_ibfk_1` FOREIGN KEY (`webshopId`) REFERENCES `webshops` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `webshop_tickets_ibfk_2` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `webshop_tickets_ibfk_3` FOREIGN KEY (`orderId`) REFERENCES `webshop_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `webshop_uitpas_numbers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `webshop_uitpas_numbers` (
  `id` varchar(36) NOT NULL,
  `uitpasNumber` varchar(36) NOT NULL,
  `webshopId` varchar(36) NOT NULL,
  `productId` varchar(36) NOT NULL,
  `orderId` varchar(36) NOT NULL,
  `ticketSaleId` varchar(255) DEFAULT NULL,
  `uitpasEventUrl` varchar(255) DEFAULT NULL,
  `basePrice` int NOT NULL,
  `basePriceLabel` varchar(255) NOT NULL,
  `reducedPrice` int NOT NULL,
  `reducedPriceUitpas` int DEFAULT NULL,
  `uitpasTariffId` varchar(255) DEFAULT NULL,
  `registeredAt` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_webshop` (`webshopId`),
  KEY `fk_order` (`orderId`),
  CONSTRAINT `fk_order` FOREIGN KEY (`orderId`) REFERENCES `webshop_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_webshop` FOREIGN KEY (`webshopId`) REFERENCES `webshops` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `webshops`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `webshops` (
  `id` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `organizationId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `products` json NOT NULL,
  `categories` json NOT NULL,
  `uri` varchar(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `legacyUri` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL,
  `domain` varchar(100) DEFAULT NULL,
  `meta` json NOT NULL,
  `privateMeta` json NOT NULL DEFAULT (json_object()),
  `serverMeta` json NOT NULL DEFAULT (json_object()),
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `domainUri` varchar(100) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uri` (`uri`) USING BTREE,
  UNIQUE KEY `domain` (`domain`,`domainUri`) USING BTREE,
  KEY `organizationId` (`organizationId`),
  CONSTRAINT `webshops_ibfk_1` FOREIGN KEY (`organizationId`) REFERENCES `organizations` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

