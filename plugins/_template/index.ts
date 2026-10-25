import definePlugin from "@utils/types";

export default definePlugin({
    name: "MyPlugin",
    description: "Template plugin. Copy this folder to start a new one.",
    authors: [{ name: "aquaryuo", id: 975151124824879125n }],
    start() {
        console.log("[MyPlugin] started");
    },
    stop() {
        console.log("[MyPlugin] stopped");
    },
});
