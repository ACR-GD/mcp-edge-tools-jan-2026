"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const bigquery_1 = require("@google-cloud/bigquery");
const bigquery = new bigquery_1.BigQuery();
// HARD LIMIT: 500MB per query. This is your "Safety Valve."
const MAX_BYTES = 500 * 1024 * 1024;
const server = new index_js_1.Server({
    name: "safe-bigquery-manager",
    version: "1.0.0",
}, {
    capabilities: { tools: {} },
});
// 1. Tell the AI what tools are available
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
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
// 2. Handle the logic when the AI calls the tool
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    if (request.params.name !== "execute_safe_query")
        throw new Error("Unknown tool");
    const sql = String(request.params.arguments?.sql);
    try {
        // STEP A: The Dry Run (This costs $0 and tells us the size)
        const [job] = await bigquery.createQueryJob({ query: sql, dryRun: true });
        const totalBytes = Number(job.metadata.statistics.totalBytesProcessed);
        // STEP B: The Guardrail check
        if (totalBytes > MAX_BYTES) {
            return {
                content: [{
                        type: "text",
                        text: `🚨 QUERY REJECTED: This query would process ${(totalBytes / (1024 * 1024)).toFixed(2)}MB. Your safety limit is 500MB. Please add a LIMIT clause or filter your data.`
                    }],
                isError: true,
            };
        }
        // STEP C: Actual Execution (Only if it's safe!)
        const [rows] = await bigquery.query(sql);
        return {
            content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
    }
    catch (error) {
        return {
            content: [{ type: "text", text: `Error: ${error.message}` }],
            isError: true,
        };
    }
});
async function main() {
    const transport = new stdio_js_1.StdioServerTransport();
    await server.connect(transport);
}
main().catch(console.error);
//# sourceMappingURL=index.js.map