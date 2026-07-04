process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
const { Agent } = await import('@mastra/core/agent');
for (const model of ['anthropic/claude-sonnet-5', 'anthropic/claude-sonnet-4-5']) {
  try {
    const agent = new Agent({ id: 't', name: 't', instructions: 'ตอบสั้นๆ', model });
    const r = await agent.generate('พูดคำว่า พร้อม', { modelSettings: { maxOutputTokens: 200 } });
    console.log(model, '→ OK:', (r.text || '').slice(0, 40));
  } catch (e) {
    console.log(model, '→ ERR:', (e.message || String(e)).slice(0, 250));
  }
}
