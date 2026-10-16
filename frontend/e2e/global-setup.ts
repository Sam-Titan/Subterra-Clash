/** Every run starts from the seed. */
export default async function globalSetup() {
	const res = await fetch("http://localhost:8000/api/reset", {
		method: "POST",
	});
	if (!res.ok) throw new Error(`POST /api/reset failed: ${res.status}`);
}
