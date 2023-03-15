-- CreateTable
CREATE TABLE IF NOT EXISTS "Projects" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fullId" TEXT NOT NULL,
    "metaPtr" TEXT NULL
);

CREATE INDEX IF NOT EXISTS ProjectsId ON Projects (id);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectOwners" (
    "address" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,

    PRIMARY KEY ("projectId", "address"),
    CONSTRAINT "ProjectOwners_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Rounds" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "implementationAddress" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectApplications" (
    "projectId" INTEGER NULL,
    "fullProjectId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "metaPtr" TEXT NULL,

    PRIMARY KEY ("projectId", "roundId"),
    CONSTRAINT "ProjectApplications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectApplications_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Rounds" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Votes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "voter" TEXT NOT NULL,
    "grantAddress" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "amountUSD" BIGINT NOT NULL,
    "projectId" INTEGER NULL,
    "fullProjectId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    CONSTRAINT "Votes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Projects" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Votes_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Rounds" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
