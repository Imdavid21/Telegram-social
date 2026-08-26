from pathlib import Path
p=Path('src/components/LandingPage.tsx')
s=p.read_text()
s=s.replace('Keep a Supergram save state and copy the message to Telegram Saved Messages.', 'Keep a Supergram save state while copying the original message into Telegram Saved Messages.')
s=s.replace('Summaries use the messages that came before, not just the sentence in front of you.', 'Summaries use the messages that came before so each update keeps the context that gives it meaning.')
p.write_text(s)
