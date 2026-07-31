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
  if (emails.length === 0) {
    throw new Error(
      "ALLOWED_EMAILS is empty or unset. Refusing to seed an empty allowlist — check /opt/verified-tours/.env",
    );
  }

  for (const email of emails) {
    await prisma.allowedUser.upsert({
      where: { email },
      create: { email, isAdmin: true },
      update: { isAdmin: true },
    });
    console.log(`allowed admin: ${email}`);
  }

  const rows = await prisma.allowedUser.findMany({
    select: { email: true, isAdmin: true },
    orderBy: { email: "asc" },
  });
  console.log(`allowlist now (${rows.length}): ${rows.map((r) => r.email).join(", ")}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
