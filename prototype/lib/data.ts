import { desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  orderItems as orderItemsTable,
  orders as ordersTable,
  products as productsTable,
} from "./db/schema";

export interface Creator {
  name: string;
  bio: string;
  imageUrl: string;
}

export type Product = typeof productsTable.$inferSelect;

export interface OrderWithItems {
  id: number;
  stripeCheckoutSessionId: string;
  status: string;
  customerEmail: string | null;
  amountTotalInCents: number;
  createdAt: Date;
  items: {
    productId: string;
    productTitle: string;
    quantity: number;
    unitPriceInCents: number;
  }[];
}

export const creator: Creator = {
  name: "Hiro Nakae",
  bio: "Ceramic artist making small-batch, wheel-thrown pottery inspired by tidepools and desert light. Every piece is fired in a single kiln in Tucson, Arizona.",
  imageUrl: "https://picsum.photos/seed/dropshelf-creator/400/400",
};

export async function getProducts(): Promise<Product[]> {
  return getDb().select().from(productsTable);
}

export async function getProductById(
  id: string
): Promise<Product | undefined> {
  const [product] = await getDb()
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, id));
  return product;
}

export async function getOrders(): Promise<OrderWithItems[]> {
  const rows = await getDb()
    .select({
      orderId: ordersTable.id,
      stripeCheckoutSessionId: ordersTable.stripeCheckoutSessionId,
      status: ordersTable.status,
      customerEmail: ordersTable.customerEmail,
      amountTotalInCents: ordersTable.amountTotalInCents,
      createdAt: ordersTable.createdAt,
      productId: orderItemsTable.productId,
      productTitle: productsTable.title,
      quantity: orderItemsTable.quantity,
      unitPriceInCents: orderItemsTable.unitPriceInCents,
    })
    .from(ordersTable)
    .leftJoin(orderItemsTable, eq(orderItemsTable.orderId, ordersTable.id))
    .leftJoin(productsTable, eq(productsTable.id, orderItemsTable.productId))
    .orderBy(desc(ordersTable.createdAt), desc(ordersTable.id));

  const orders = new Map<number, OrderWithItems>();

  for (const row of rows) {
    let order = orders.get(row.orderId);
    if (!order) {
      order = {
        id: row.orderId,
        stripeCheckoutSessionId: row.stripeCheckoutSessionId,
        status: row.status,
        customerEmail: row.customerEmail,
        amountTotalInCents: row.amountTotalInCents,
        createdAt: row.createdAt,
        items: [],
      };
      orders.set(row.orderId, order);
    }

    if (row.productId !== null) {
      order.items.push({
        productId: row.productId,
        productTitle: row.productTitle ?? row.productId,
        quantity: row.quantity!,
        unitPriceInCents: row.unitPriceInCents!,
      });
    }
  }

  return Array.from(orders.values());
}
