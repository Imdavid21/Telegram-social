from pathlib import Path

# Feed interaction language and conversation affordances.
p = Path('src/components/FeedCard.tsx')
s = p.read_text()
s = s.replace("aria-label={liked ? 'Unlike on Telegram' : 'Like on Telegram'}><HeartIcon /></button>", "aria-label={liked ? 'Remove Telegram reaction' : 'React on Telegram'} data-label=\"React\"><HeartIcon /></button>")
s = s.replace('aria-label="Reply on Telegram"><MessageIcon /></button>', 'aria-label="Open discussion" data-label="Discuss"><MessageIcon /></button>')
s = s.replace("aria-label={item.noForwards ? 'Forwarding restricted' : 'Forward to Telegram contact'}><SendIcon /></button>", "aria-label={item.noForwards ? 'Forwarding restricted' : 'Forward to Telegram contact'} data-label=\"Forward\"><SendIcon /></button>")
s = s.replace("aria-label={item.saved ? 'Remove from saved' : 'Save'}><BookmarkIcon /></button>", "aria-label={item.saved ? 'Remove from Saved Messages' : 'Save to Saved Messages'} data-label=\"Save\"><BookmarkIcon /></button>")
engagement = '''    {(reactions.length > 0 || item.views || item.comments) && <div className="sg-engagement">
      {reactions.length > 0 && <span className="sg-reaction-summary">{reactions.map((reaction, i) => <span key={`${String(reaction?.emoji || '♥')}-${i}`}>{String(reaction?.emoji || '♥')} {Number(reaction?.count || 0)}</span>)}</span>}
      <span className="sg-stats">{item.views && <span><EyeIcon />{String(item.views)}</span>}{!!Number(item.comments || 0) && <span><MessageIcon />{Number(item.comments || 0)}</span>}</span>
    </div>}
'''
replacement = engagement + '''\n    <button type="button" className="sg-discussion-entry pressable" onClick={() => { setInteractionError(''); setReplyOpen(true) }}>
      <span>{Number(item.comments || 0) > 0 ? `View discussion · ${Number(item.comments || 0)} ${Number(item.comments || 0) === 1 ? 'reply' : 'replies'}` : 'Join discussion'}</span>
      <MessageIcon />
    </button>\n'''
if engagement in s:
    s = s.replace(engagement, replacement, 1)
s = s.replace('<BottomSheet open={replyOpen} onClose={() => setReplyOpen(false)} title="Reply">', '<BottomSheet open={replyOpen} onClose={() => setReplyOpen(false)} title="Discussion">')
s = s.replace('placeholder="Write a reply…"', 'placeholder="Reply to this post…"')
s = s.replace("{replyBusy ? 'Sending…' : 'Reply on Telegram'}", "{replyBusy ? 'Sending…' : 'Send reply'}")
p.write_text(s)

# Desktop context rail and profile-photo use.
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
if anchor in s and 'const recentConversations' not in s:
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
if rail_anchor in s and 'className="sg-context-rail"' not in s:
    s = s.replace(rail_anchor, rail, 1)
p.write_text(s)

# Consumer-social design layer. Brand stays monochrome; functional state is Telegram blue.
p = Path('src/app-system.css')
s = p.read_text()
s += r'''

/* Consumer-social Home redesign: monochrome identity, Telegram-blue behavior. */
:root,
html[data-theme='dark']{
  --app-accent:#229ED9;
  --app-accent-active:#2AABEE;
  --sg-blue:#229ED9;
  --sg-blue-strong:#2AABEE;
  --sg-blue-soft:rgba(34,158,217,.13);
}
html[data-theme='light']{
  --app-accent:#229ED9;
  --app-accent-active:#1688be;
  --sg-blue:#229ED9;
  --sg-blue-strong:#1688be;
  --sg-blue-soft:rgba(34,158,217,.10);
}
.sg-brand,.sg-brand:hover{color:var(--app-text)}
.sg-primary-nav button.is-active{background:var(--sg-blue-soft);color:var(--app-text)}
.sg-primary-nav button.is-active .sg-nav-icon{color:var(--sg-blue)}
.sg-nav-icon b,.sg-unread-dot{background:var(--sg-blue)!important}
.sg-verified,.sg-story-evidence-link,.sg-news-expand,.sg-all-sources-button{color:var(--sg-blue)!important}

/* Desktop becomes navigation + focused media feed + Telegram context. */
@media(min-width:1180px){
  .sg-main{width:auto;margin-left:244px;margin-right:324px;padding:0 28px 96px}
  .sg-feed-column{width:min(660px,100%);max-width:660px}
  .sg-context-rail{display:flex;position:fixed;right:0;top:0;bottom:0;width:324px;padding:26px 22px;flex-direction:column;gap:28px;border-left:1px solid var(--app-border-soft);background:var(--app-bg);overflow:auto;z-index:35}
}
@media(min-width:901px) and (max-width:1179px){.sg-context-rail{display:none}}
@media(max-width:900px){.sg-context-rail{display:none}}
.sg-context-section{display:flex;flex-direction:column;gap:4px}
.sg-context-title{display:flex;align-items:center;justify-content:space-between;margin:0 4px 8px}
.sg-context-title strong{font-size:13px;font-weight:700;color:var(--app-text)}
.sg-context-title button{border:0;background:transparent;color:var(--sg-blue);font-size:12px;font-weight:650;cursor:pointer}
.sg-context-row{width:100%;min-height:58px;padding:7px 6px;display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:10px;border:0;border-radius:10px;background:transparent;color:var(--app-text);text-align:left;cursor:pointer}
.sg-context-row:hover{background:var(--app-hover)}
.sg-context-avatar{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;overflow:hidden;font-size:11px;font-weight:750;color:#fff}.sg-context-avatar img{width:100%;height:100%;object-fit:cover}
.sg-context-row>span:nth-child(2){min-width:0;display:flex;flex-direction:column;gap:2px}.sg-context-row strong{font-size:13px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sg-context-row small{font-size:11px;line-height:1.25;color:var(--app-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-style:normal}.sg-context-row i{width:7px;height:7px;border-radius:50%;background:var(--sg-blue)}.sg-context-row em{min-width:20px;height:20px;padding:0 6px;border-radius:10px;display:grid;place-items:center;background:var(--sg-blue);color:white;font-size:10px;font-style:normal;font-weight:750}
.sg-context-empty,.sg-context-note{font-size:11px;line-height:1.45;color:var(--app-muted)}.sg-context-note{margin:auto 4px 0;padding-top:18px;border-top:1px solid var(--app-border-soft)}

/* Feed hierarchy: content, not cards. */
.sg-feed{padding-top:0}
.sg-post{margin:0;padding:0 0 18px;border:0;border-bottom:1px solid var(--app-border-soft);border-radius:0;background:transparent;box-shadow:none;overflow:visible}
.sg-post+.sg-post{padding-top:14px}
.sg-post-head{min-height:58px;padding:10px 2px 9px;grid-template-columns:42px minmax(0,1fr) auto auto}
.sg-avatar{width:40px;height:40px}
.sg-source-line button{font-size:14px!important;font-weight:680!important;letter-spacing:-.01em}
.sg-post-who>span{font-size:12px!important;line-height:1.25;color:var(--app-muted)}
.sg-more{margin-right:-8px}
.sg-media{margin:0;width:100%;border-radius:14px;overflow:hidden;background:#09090a}
.sg-media-asset,.sg-lightbox-button,.sg-media img,.sg-media video{border-radius:14px}
.sg-media img,.sg-media video{max-height:min(760px,80vh);object-fit:contain}
.sg-caption,.sg-text-post,.sg-news-brief,.sg-post-actions,.sg-engagement,.sg-discussion-entry{margin-left:2px!important;margin-right:2px!important}
.sg-caption{padding-top:10px;font-size:14px;line-height:1.48}.sg-caption-source{font-weight:680}
.sg-text-post{padding:12px 2px 4px;font-size:16px;line-height:1.52;letter-spacing:-.012em}
.sg-news-brief{padding:12px 2px 4px}.sg-news-kicker{color:var(--sg-blue)!important;font-size:10px!important;font-weight:750!important;text-transform:uppercase;letter-spacing:.07em}.sg-news-brief>strong{display:block;margin-top:4px;font-size:18px;line-height:1.28;font-weight:720;letter-spacing:-.025em}.sg-news-brief>p{margin-top:5px;font-size:13px;line-height:1.48;color:var(--app-secondary)}

/* Actions read as Telegram primitives while retaining compact iconography. */
.sg-post-actions-ref{min-height:48px;margin-top:5px!important;display:flex;align-items:center;justify-content:space-between}
.sg-actions-left{display:flex;gap:2px}.sg-action{position:relative;min-width:44px;height:44px;padding:0 8px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;gap:5px;color:var(--app-secondary)}.sg-action svg{width:22px;height:22px;stroke-width:1.65}.sg-action:hover{background:var(--app-hover)}.sg-action.is-liked,.sg-action.is-active{color:var(--sg-blue)}.sg-action:active{transform:scale(.94)}
.sg-action[data-label]::after{content:attr(data-label);display:none;font-size:11px;font-weight:650;color:currentColor}
@media(min-width:1180px){.sg-action[data-label]::after{display:inline}.sg-action{padding:0 9px}.sg-actions-left{gap:4px}}
.sg-engagement{min-height:20px;padding:0 0 3px;display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--app-muted)}
.sg-reaction-summary{display:flex;gap:9px}.sg-stats svg{width:14px;height:14px}
.sg-discussion-entry{width:calc(100% - 4px);min-height:36px;padding:4px 0;display:flex;align-items:center;justify-content:space-between;border:0;border-top:1px solid var(--app-border-soft);background:transparent;color:var(--app-muted);font-size:12px;font-weight:600;text-align:left}.sg-discussion-entry:hover{color:var(--sg-blue)}.sg-discussion-entry svg{width:17px;height:17px}

/* Profile image in navigation. */
.sg-account-avatar{overflow:hidden}.sg-account-avatar img{display:block;width:100%;height:100%;object-fit:cover;border-radius:50%}

/* Mobile: dense, media-first, stable safe areas. */
@media(max-width:720px){
  .sg-mobile-header{height:54px;padding:0 12px;background:color-mix(in srgb,var(--app-bg) 92%,transparent);backdrop-filter:blur(18px)}
  .sg-feed-toolbar{top:54px;min-height:42px;padding:4px 12px;border-bottom:1px solid var(--app-border-soft);background:color-mix(in srgb,var(--app-bg) 94%,transparent)}
  .sg-post{margin:0;padding:0 12px 14px;border-bottom:1px solid var(--app-border-soft)}
  .sg-post+.sg-post{padding-top:9px}
  .sg-post-head{padding:8px 0 8px;grid-template-columns:38px minmax(0,1fr) auto auto}.sg-avatar{width:36px;height:36px}.sg-source-line button{font-size:13px!important}.sg-post-who>span{font-size:11px!important}
  .sg-media{width:100%;margin:0;border-radius:12px}.sg-media-asset,.sg-lightbox-button,.sg-media img,.sg-media video{border-radius:12px}
  .sg-caption,.sg-text-post,.sg-news-brief,.sg-post-actions,.sg-engagement,.sg-discussion-entry{margin-left:0!important;margin-right:0!important}
  .sg-text-post{font-size:15px;line-height:1.5}.sg-news-brief>strong{font-size:17px}
  .sg-post-actions-ref{min-height:46px;margin-top:3px!important}.sg-action{min-width:44px;height:44px;padding:0 7px}
  .sg-discussion-entry{width:100%}
  .sg-mobile-nav{height:60px!important;bottom:calc(8px + env(safe-area-inset-bottom))!important;border-radius:17px!important}
}

@media(prefers-reduced-motion:reduce){.sg-action:active{transform:none}}
'''
p.write_text(s)
