import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@skillocraft.com";
  const password = "Admin@123";
  const name = "Super Admin";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Admin already exists:", email);
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      role: "ADMIN",
      contact: "",
      admin: {
        create: { name },
      },
    },
  });

  console.log("✅ Admin created successfully!");
  console.log("   Email:   ", email);
  console.log("   Password:", password);
  console.log("   User ID: ", user.id);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
