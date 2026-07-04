process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
process.env.ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const { Agent } = await import('@mastra/core/agent');
try {
  const agent = new Agent({ id: 't', name: 't', instructions: 'ตอบสั้นๆ', model: 'anthropic/claude-sonnet-5' });
  const r = await agent.generate('พูดคำว่า พร้อม', { modelSettings: { maxOutputTokens: 300 } });
  console.log('OK:', (r.text || '').slice(0, 60));
} catch (e) {
  console.log('ERR:', (e.message || String(e)).slice(0, 150));
}
