
const FLUX_KEY = "sk_LyW5SJiIAVI5r4tEcH47DdJAAXgaOh08";
const prompt = encodeURIComponent("A futuristic city at night, neon lights, high quality, flux model");
const url = `https://image.pollinations.ai/prompt/${prompt}?model=flux&width=1024&height=1024&seed=42&key=${FLUX_KEY}`;

console.log("Tentando URL:", url.replace(FLUX_KEY, "HIDDEN_KEY"));

async function test() {
    try {
        const response = await fetch(url);
        console.log("Status:", response.status);
        if (response.ok) {
            const blob = await response.blob();
            console.log("Sucesso! Tamanho do blob:", blob.size);
        } else {
            const text = await response.text();
            console.log("Erro na resposta:", text);
        }
    } catch (error) {
        console.error("Erro no fetch:", error);
    }
}

test();
