
async function run() {
    try {
        const res = await fetch('http://localhost:5174/api/dashboard/stats/images');
        console.log(await res.text());
    } catch(e) { console.log(e.message); }
}
run();

