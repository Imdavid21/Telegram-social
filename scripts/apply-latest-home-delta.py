from pathlib import Path

# Replay the latest Home redesign onto the reconciled backend/search branch.

p = Path('src/components/FeedCard.tsx')
s = p.read_text()
s = s.replace(
    "aria-label={liked ? 'Unlike on Telegram' : 'Like on Telegram'}><HeartIcon /></button>",
    "aria-label={liked ? 'Remove Telegram reaction' : 'React on Telegram'} data-label=\"React\"><HeartIcon /></button>",
)
s = s.replace(
    'aria-label="Reply on Telegram"><MessageIcon /></button>',
    'aria-label="Open discussion" data-label="Discuss"><MessageIcon /></button>',
)
s = s.replace(
    "aria-label={item.noForwards ? 'Forwarding restricted' : 'Forward to Telegram contact'}><SendIcon /></button>",
    "aria-label={item.noForwards ? 'Forwarding restricted' : 'Forward to Telegram contact'} data-label=\"Forward\"><SendIcon /></button>",
)
s = s.replace(
    "aria-label={item.saved ? 'Remove from saved' : 'Save'}><BookmarkIcon /></button>",
    "aria-label={item.saved ? 'Remove from Saved Messages' : 'Save to Saved Messages'} data-label=\"Save\"><BookmarkIcon /></button>",
)
engagement = '''    {(reactions.length > 0 || item.views || item.comments) && <div className="sg-engagement">
      {reactions.length > 0 && <span className="sg-reaction-summary">{reactions.map((reaction, i) => <span className={reaction.chosen ? 'is-chosen' : undefined} key={`${String(reaction?.emoji || '♥')}-${i}`}>{String(reaction?.emoji || '♥')} {Number(reaction?.count || 0)}</span>)}</span>}
      <span className="sg-stats">{item.views && <span><EyeIcon />{String(item.views)}</span>}{!!Number(item.comments || 0) && <span><MessageIcon />{Number(item.comments || 0)}</span>}</span>
    </div>}
'''
discussion = engagement + '''\n    <button type="button" className="sg-discussion-entry pressable" onClick={() => { setInteractionError(''); setReplyOpen(true) }}>
      <span>{Number(item.comments || 0) > 0 ? `View discussion · ${Number(item.comments || 0)} ${Number(item.comments || 0) === 1 ? 'reply' : 'replies'}` : 'Join discussion'}</span>
      <MessageIcon />
    </button>\n'''
if 'className="sg-discussion-entry pressable"' not in s:
    if engagement not in s:
        raise SystemExit('FeedCard engagement anchor missing')
    s = s.replace(engagement, discussion, 1)
s = s.replace('<BottomSheet open={replyOpen} onClose={() => setReplyOpen(false)} title="Reply">', '<BottomSheet open={replyOpen} onClose={() => setReplyOpen(false)} title="Discussion">')
s = s.replace('placeholder="Write a reply…"', 'placeholder="Reply to this post…"')
s = s.replace("{replyBusy ? 'Sending…' : 'Reply on Telegram'}", "{replyBusy ? 'Sending…' : 'Send reply'}")
p.write_text(s)

p = Path('src/ProductApp.tsx')
s = p.read_text()
anchor = '''  const searchSources = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (q ? safeChannels.filter(channel => `${channel.title} ${channel.username || ''}`.toLowerCase().includes(q)) : topSources).slice(0, 8)
  }, [query, safeChannels, topSources])
'''
insert = anchor + '''\n  const recentConversations = useMemo(() => {
    const seen = new Set<string>()
    const rows: Array<{ item: FeedItem; channel: Channel }> = []
    for (const item of collapsedFeed) {
      if (item.outgoing || item.sponsored) continue
      const channel = channelMap.get(item.channelId)
      if (!channel || (channel.type !== 'person' && channel.type !== 'group') || seen.has(channel.id)) continue
      seen.add(channel.id)
      rows.push({ item, channel })
      if (rows.length >= 5) break
    }
    return rows
  }, [channelMap, collapsedFeed])

  const contextChannels = useMemo(() => topSources.filter(channel => channel.type === 'channel').slice(0, 4), [topSources])
'''
if 'const recentConversations' not in s:
    if anchor not in s:
        raise SystemExit('ProductApp searchSources anchor missing')
    s = s.replace(anchor, insert, 1)
s = s.replace('<span className="sg-account-avatar">{initials(me?.firstName)}</span>', '<span className="sg-account-avatar">{me?.avatar ? <img src={me.avatar} alt="" /> : initials(me?.firstName)}</span>')
rail_anchor = '''    </main>\n\n    {searchOpen && <div className="sg-search-layer"'''
rail = '''    </main>\n\n    <aside className="sg-context-rail" aria-label="Telegram context">
      <section className="sg-context-section">
        <div className="sg-context-title"><strong>Recent chats</strong><button type="button" onClick={() => setSourceBrowserOpen(true)}>See all</button></div>
        {recentConversations.length ? recentConversations.map(({ item, channel }) => <button type="button" className="sg-context-row" key={channel.id} onClick={() => selectSource(channel.id)}>
          <span className="sg-context-avatar" style={{ background: channel.accent || '#242426' }}>{channel.avatar ? <img src={channel.avatar} alt="" /> : initials(channel.title)}</span>
          <span><strong>{channel.title}</strong><small>{String(item.text || '').trim().slice(0, 62) || (item.media ? 'Media' : 'Telegram update')}</small></span>
          {item.unread && <i aria-label="Unread" />}
        </button>) : <div className="sg-context-empty">Recent Telegram conversations will appear here.</div>}
      </section>
      {contextChannels.length ? <section className="sg-context-section">
        <div className="sg-context-title"><strong>Channels</strong><button type="button" onClick={() => setSourceBrowserOpen(true)}>Browse</button></div>
        {contextChannels.map(channel => <button type="button" className="sg-context-row" key={channel.id} onClick={() => selectSource(channel.id)}>
          <span className="sg-context-avatar" style={{ background: channel.accent || '#242426' }}>{channel.avatar ? <img src={channel.avatar} alt="" /> : initials(channel.title)}</span>
          <span><strong>{channel.title}</strong><small>{channel.username ? `@${channel.username}` : 'Telegram channel'}</small></span>
          {Number(channel.unread || 0) > 0 && <em>{Number(channel.unread || 0) > 99 ? '99+' : Number(channel.unread || 0)}</em>}
        </button>)}
      </section> : null}
      <p className="sg-context-note">Public content can move directly into Telegram discussion, forwarding, and Saved Messages.</p>
    </aside>\n\n    {searchOpen && <div className="sg-search-layer"'''
if 'className="sg-context-rail"' not in s:
    if rail_anchor not in s:
        raise SystemExit('ProductApp context rail anchor missing')
    s = s.replace(rail_anchor, rail, 1)
p.write_text(s)
