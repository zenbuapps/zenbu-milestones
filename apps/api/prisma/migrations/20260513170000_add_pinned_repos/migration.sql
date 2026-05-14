-- CreateTable
CREATE TABLE "pinned_repos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "repoOwner" TEXT NOT NULL,
    "repoName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pinned_repos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pinned_repos_userId_idx" ON "pinned_repos"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "pinned_repos_userId_repoOwner_repoName_key" ON "pinned_repos"("userId", "repoOwner", "repoName");

-- AddForeignKey
ALTER TABLE "pinned_repos" ADD CONSTRAINT "pinned_repos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
