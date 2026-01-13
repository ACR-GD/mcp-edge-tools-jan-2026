import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { BigQuery } from "@google-cloud/bigquery";

const bigquery = new BigQuery();
const MAX_BYTES = 500 * 1024 * 1024; 

const server = new Server({
  name: "safe-bigquery-manager",
  version: "1.0.0",
}, {
  capabilities: { tools: {} },
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "execute_safe_query",
    description: "Executes a BigQuery SQL query but ONLY if it processes less than 500MB of data.",
    inputSchema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "The SQL query to analyze and run" },
      },
      required: ["sql"],
    },
  }],
}));

server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
  if (request.params.name !== "execute_safe_query") throw new Error("Unknown tool");

  const sql = String(request.params.arguments?.sql);

  try {
    const [job] = await bigquery.createQueryJob({ query: sql, dryRun: true });
    const totalBytes = Number(job.metadata.statistics.totalBytesProcessed);

    if (totalBytes > MAX_BYTES) {
      return {
        content: [{ 
          type: "text", 
          text: `🚨 QUERY REJECTED: processes ${(totalBytes / (1024 * 1024)).toFixed(2)}MB. Limit is 500MB.` 
        }],
        isError: true,
      };
    }

    const [rows] = await bigquery.query(sql);
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);