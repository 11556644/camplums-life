import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const products = await db.product.findMany({ where: { status: "active" }, orderBy: { createdAt: "asc" } });
  const images = [
    ["/uploads/ipad-air.png"],
    ["/uploads/kaoyan-english.png"],
    ["/uploads/desk-lamp.png"],
  ];

  for (let i = 0; i < Math.min(products.length, 3); i++) {
    await db.product.update({
      where: { id: products[i].id },
      data: { images: JSON.stringify(images[i]) },
    });
    console.log(`Updated product "${products[i].title}" with images`);
  }
  console.log("Done!");
}

main().catch(console.error).finally(() => db.$disconnect());
