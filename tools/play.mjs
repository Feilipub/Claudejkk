// Client for tools/playd.mjs. Usage: node tools/play.mjs PORT '[{"hold":"KeyW","ms":1500},{"shot":"/path/a.png"}]'
const [port, json] = process.argv.slice(2);
const r = await fetch(`http://localhost:${port}/`, { method: 'POST', body: json });
console.log(await r.text());
