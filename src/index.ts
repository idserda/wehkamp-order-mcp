import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "wehkamp-mcp",
  version: "1.0.0",
});

const ORDERS_QUERY = `query OrdersByDate($startDate: String, $endDate: String) {
  orders(startDate: $startDate, endDate: $endDate) {
    orderNumber
    totalAmount
    totalDiscount
    creationDate
    orderlines {
      orderlineNumber
      productNumber
      imageUrl
      status
      __typename
    }
    __typename
  }
}`;

const ORDER_DETAILS_QUERY = `query OrderDetailsQuery($orderNumber: String) {
  orderDetails(orderNumber: $orderNumber) {
    orderNumber
    totalAmount
    shippingCosts
    creationDate
    orderCreationDate
    numberOfProducts
    hasCancellableOrderlines
    deliveryServices {
      type
      costs
      isCancelled
      refundable
      __typename
    }
    orderlineGroups {
      isCancellationAllowed
      parcelIntervention {
        canChangeAddress
        canCancel
        timeOptions {
          from
          to
          __typename
        }
        __typename
      }
      isChangeAppointmentAllowed
      title
      subtitle
      appointmentDate {
        timestamp
        dayOfWeek
        dayOfMonth
        __typename
      }
      deliveryDate {
        timestamp
        dayOfWeek
        dayOfMonth
        __typename
      }
      carrierOrderNumber
      carrierName
      carrierTrackingUrl
      deliveryDetails {
        streetName
        houseNumber
        houseNumberAddition
        postalCode
        cityName
        country
        servicePointId
        __typename
      }
      orderlines {
        status
        id
        price
        numberOfProducts
        isCancelled
        isReturned
        isReturnable
        isDelivered
        isSoldOut
        isCorrected
        isWaitingForCustomerAppointment
        product {
          size
          productNumber
          color
          title
          imageUrl
          articleType
          __typename
        }
        curtainConfigurationId
        combinationArticles {
          id
          price
          numberOfProducts
          isCancelled
          isReturned
          isReturnable
          isDelivered
          isSoldOut
          isRegisteredForReturn
          isCorrected
          product {
            size
            productNumber
            color
            title
            imageUrl
            articleType
            __typename
          }
          __typename
        }
        __typename
      }
      indicativeDeliveryDate
      __typename
    }
    __typename
  }
  fullShopperData {
    personalInformation {
      customerNumber
      __typename
    }
    __typename
  }
}`;

function getProductUrl(productNumber: unknown): string | null {
  const normalized = typeof productNumber === "string" ? productNumber.trim() : productNumber == null ? "" : String(productNumber).trim();

  if (!normalized) {
    return null;
  }

  return `https://www.wehkamp.nl/product/${encodeURIComponent(normalized)}`;
}

function addProductUrls<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => addProductUrls(entry)) as T;
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const productNumber = record.productNumber ?? record.articleNumber;

  if (productNumber !== undefined && productNumber !== null) {
    const productUrl = getProductUrl(productNumber);
    if (productUrl) {
      record.productUrl = productUrl;
    }
  }

  for (const [key, nestedValue] of Object.entries(record)) {
    if (nestedValue && typeof nestedValue === "object") {
      record[key] = addProductUrls(nestedValue) as unknown;
    }
  }

  return value;
}

function getToken(): string {
  const token = process.env.WEHKAMP_TOKEN;

  if (!token) {
    throw new Error("Missing Wehkamp auth token. Set WEHKAMP_TOKEN.");
  }

  return token.trim();
}

function getCookieHeader(token: string): string {
  return `token=${token}`;
}

server.registerTool(
  "get_orders",
  {
    title: "Get Wehkamp orders",
    description: "Fetch order data for a date range from the logged-in Wehkamp account. Monetary values are returned in cents.",
    inputSchema: {
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Value must be ISO date YYYY-MM-DD"),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Value must be ISO date YYYY-MM-DD"),
      limit: z.number().int().min(1).max(50).optional().default(25),
    },
  },
  async ({ startDate, endDate, limit }) => {
    const token = getToken();
    const requestBody = {
      operationName: "OrdersByDate",
      variables: { startDate, endDate },
      extensions: {
        clientLibrary: {
          name: "@apollo/client",
          version: "4.3.1",
        },
      },
      query: ORDERS_QUERY,
    };

    const response = await fetch("https://www.wehkamp.nl/mijn/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: "https://www.wehkamp.nl",
        referer: "https://www.wehkamp.nl/mijn",
        cookie: getCookieHeader(token),
        "user-agent": "Mozilla/5.0 (compatible; WehkampMCP/1.0.0)",
      },
      body: JSON.stringify(requestBody),
    });

    const payload = (await response.json()) as {
      data?: { orders?: Array<Record<string, unknown>> };
      errors?: Array<{ message?: string }>;
      message?: string;
    };

    if (!response.ok || payload.errors?.length) {
      const errorMessage = payload.errors?.[0]?.message ?? payload.message ?? `HTTP ${response.status}`;
      throw new Error(`Wehkamp API request failed: ${errorMessage}`);
    }

    const orders = Array.isArray(payload.data?.orders) ? payload.data.orders.slice(0, limit ?? 25) : [];
    const enrichedOrders = addProductUrls(orders) as Array<Record<string, unknown>>;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ currency: "EUR", priceUnit: "cents", count: enrichedOrders.length, orders: enrichedOrders }, null, 2),
        },
      ],
      structuredContent: {
        currency: "EUR",
        priceUnit: "cents",
        count: enrichedOrders.length,
        orders: enrichedOrders,
      },
    };
  },
);

server.registerTool(
  "get_order_details",
  {
    title: "Get Wehkamp order details",
    description: "Fetch detailed order data for a specific Wehkamp order number. Monetary values are returned in cents.",
    inputSchema: {
      orderNumber: z.string().min(1, "Order number is required"),
    },
  },
  async ({ orderNumber }) => {
    const token = getToken();
    const requestBody = {
      operationName: "OrderDetailsQuery",
      variables: { orderNumber },
      extensions: {
        clientLibrary: {
          name: "@apollo/client",
          version: "4.3.1",
        },
      },
      query: ORDER_DETAILS_QUERY,
    };

    const response = await fetch("https://www.wehkamp.nl/mijn/graphql", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: "https://www.wehkamp.nl",
        referer: "https://www.wehkamp.nl/mijn",
        cookie: getCookieHeader(token),
        "user-agent": "Mozilla/5.0 (compatible; WehkampMCP/1.0.0)",
      },
      body: JSON.stringify(requestBody),
    });

    const payload = (await response.json()) as {
      data?: {
        orderDetails?: Record<string, unknown>;
        fullShopperData?: Record<string, unknown>;
      };
      errors?: Array<{ message?: string }>;
      message?: string;
    };

    if (!response.ok || payload.errors?.length) {
      const errorMessage = payload.errors?.[0]?.message ?? payload.message ?? `HTTP ${response.status}`;
      throw new Error(`Wehkamp order details request failed: ${errorMessage}`);
    }

    const orderDetails = payload.data?.orderDetails ?? null;
    const enrichedOrderDetails = addProductUrls(orderDetails) as Record<string, unknown> | null;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ currency: "EUR", priceUnit: "cents", orderNumber, orderDetails: enrichedOrderDetails, fullShopperData: payload.data?.fullShopperData ?? null }, null, 2),
        },
      ],
      structuredContent: {
        currency: "EUR",
        priceUnit: "cents",
        orderNumber,
        orderDetails: enrichedOrderDetails,
        fullShopperData: payload.data?.fullShopperData ?? null,
      },
    };
  },
);


async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Wehkamp MCP server running on stdio");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to start Wehkamp MCP server: ${message}`);
  process.exit(1);
});
