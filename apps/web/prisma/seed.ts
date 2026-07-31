import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseAllowedEmails(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const emails = parseAllowedEmails(process.env.ALLOWED_EMAILS);
  for (const email of emails) {
    await prisma.allowedUser.upsert({
      where: { email },
      create: { email, isAdmin: true },
      update: { isAdmin: true },
    });
    console.log(`allowed admin: ${email}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
