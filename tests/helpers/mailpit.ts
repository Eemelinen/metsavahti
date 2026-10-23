/** Thin client for the Mailpit REST API (https://mailpit.axllent.org/docs/api-v1/). */
export type MailpitMessageSummary = {
  ID: string
  From: { Name: string; Address: string }
  To: Array<{ Name: string; Address: string }>
  Subject: string
  Snippet: string
  Created: string
}

export type MailpitMessage = MailpitMessageSummary & {
  Text: string
  HTML: string
}

export function createMailpitClient(apiUrl: string) {
  const base = apiUrl.replace(/\/$/, '')

  async function listMessages(): Promise<MailpitMessageSummary[]> {
    const res = await fetch(`${base}/api/v1/messages?limit=200`)
    if (!res.ok) throw new Error(`Mailpit list failed: ${res.status}`)
    const body = (await res.json()) as { messages: MailpitMessageSummary[] }
    return body.messages
  }

  async function getMessage(id: string): Promise<MailpitMessage> {
    const res = await fetch(`${base}/api/v1/message/${id}`)
    if (!res.ok) throw new Error(`Mailpit get failed: ${res.status}`)
    return (await res.json()) as MailpitMessage
  }

  async function deleteAll(): Promise<void> {
    const res = await fetch(`${base}/api/v1/messages`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Mailpit delete failed: ${res.status}`)
  }

  /** Poll until at least `count` messages exist (or time out). */
  async function waitForMessages(count = 1, timeoutMs = 10_000): Promise<MailpitMessageSummary[]> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const messages = await listMessages()
      if (messages.length >= count) return messages
      if (Date.now() > deadline) {
        throw new Error(
          `Timed out waiting for ${count} message(s) in Mailpit; got ${messages.length}`,
        )
      }
      await new Promise((r) => setTimeout(r, 200))
    }
  }

  function extractFirstLink(text: string, hostIncludes?: string): string | undefined {
    const links = text.match(/https?:\/\/[^\s"'<>)]+/g) ?? []
    return hostIncludes ? links.find((l) => l.includes(hostIncludes)) : links[0]
  }

  return { listMessages, getMessage, deleteAll, waitForMessages, extractFirstLink }
}

export type MailpitClient = ReturnType<typeof createMailpitClient>
