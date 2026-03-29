import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { ContentBlock, Message } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({});

function contentToText(blocks: ContentBlock[] | undefined): string {
  if (!blocks?.length) return '';
  const parts: string[] = [];
  for (const b of blocks) {
    if ('text' in b && typeof b.text === 'string' && b.text) parts.push(b.text);
  }
  return parts.join('\n').trim();
}

export async function converseAssistant(params: {
  modelId: string;
  systemText: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
}): Promise<string> {
  const system = [{ text: params.systemText }];
  const messages: Message[] = params.messages.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));

  const out = await client.send(
    new ConverseCommand({
      modelId: params.modelId,
      system,
      messages,
    })
  );

  const text = contentToText(out.output?.message?.content);
  if (!text) {
    throw new Error('Bedrock returned empty assistant content');
  }
  return text;
}
