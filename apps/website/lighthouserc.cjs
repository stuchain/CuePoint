// Lighthouse CI reads this file (see "check:lighthouse" in package.json). The settings live in
// lighthouserc.json; this only moves the preview server off port 4321 when WEBSITE_PORT is set,
// for a checkout whose neighbor already holds 4321.
const config = require("./lighthouserc.json");

const port = process.env.WEBSITE_PORT || "4321";
module.exports = JSON.parse(JSON.stringify(config).replaceAll("localhost:4321", `localhost:${port}`).replaceAll("--port 4321", `--port ${port}`));
