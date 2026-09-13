

const BASE_URL = 'http://127.0.0.1:3000';

const questions = [
  "What type of sensor is an LVDT?",
  "What is the gauge factor of a strain gauge?",
  "How does a Type K thermocouple compare with a Type J thermocouple?",
  "Why must the sampling rate of an ADC be at least twice the highest frequency component in the input signal?",
  "What is full-duplex communication in the context of SPI?"
];

async function run() {
  console.log('Running timing smoke test...\n');
  
  const aggregates = {
    embedding_latency_ms: [],
    retrieval_latency_ms: [],
    rerank_latency_ms: [],
    context_build_latency_ms: [],
    generation_latency_ms: [],
    total_latency_ms: []
  };

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    console.log(`[Q${i+1}] ${q}`);
    
    const response = await fetch(`${BASE_URL}/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q })
    });
    
    const data = await response.json();
    
    if (data.error) {
      console.log(`[Error] ${data.error}`);
      continue;
    }
    
    const timings = data.timings;
    const usage = data.usage || {};
    
    console.log(`Timings:`);
    console.log(`  Generation:     ${timings.generation_latency_ms?.toFixed(2)} ms`);
    console.log(`  Total:          ${timings.total_latency_ms?.toFixed(2)} ms`);
    console.log(`LLM Details:`);
    console.log(`  Finish Reason:  ${data.finish_reason}`);
    console.log(`  Input Tokens:   ${usage.prompt_tokens}`);
    console.log(`  Output Tokens:  ${usage.completion_tokens}`);
    console.log(`  Total Tokens:   ${usage.total_tokens}`);
    console.log(`Answer Preview:`);
    console.log(`  ${data.answer?.substring(0, 200).replace(/\n/g, ' ')}...`);
    console.log(`Answer Length:    ${data.answer?.length} chars\n`);
    
    if (timings.generation_latency_ms) aggregates.generation_latency_ms.push(timings.generation_latency_ms);
    if (timings.total_latency_ms) aggregates.total_latency_ms.push(timings.total_latency_ms);
  }
  
  console.log('--- AVERAGE LATENCIES ---');
  for (const [key, values] of Object.entries(aggregates)) {
    if (values.length > 0) {
      const avg = values.reduce((a, b) => a + b, 0) / values.length;
      console.log(`${key}: ${avg.toFixed(2)} ms`);
    }
  }
}

run().catch(console.error);
