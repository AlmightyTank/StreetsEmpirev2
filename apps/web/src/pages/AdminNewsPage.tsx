import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AdminNewsDto, AdminNewsPostDto, AdminSiteBannersDto, SiteBannerTone } from '@streets/shared';
import { adminApi } from '../api/admin.js';
import { ApiError } from '../api/client.js';
import { Alert } from '../components/Alert.js';
import { Field } from '../components/Field.js';
import { Panel } from '../components/Panel.js';
import { GameLayout } from '../layouts/GameLayout.js';
import { adminWhen, localInputToIso } from '../utils/admin.js';

const emptyPost = { title: '', body: '', roundId: '', pinned: false, publishAt: '', mirror: false };
const emptyBanner = { message: '', tone: 'info' as SiteBannerTone, startsAt: '', endsAt: '' };

type Pending = { kind: 'edit' | 'delete'; post: AdminNewsPostDto };

function PostTags({ post }: { post: AdminNewsPostDto }) {
  const scheduled = Date.parse(post.publishedAt) > Date.now();
  return (
    <span className="se-admin-tags">
      {post.isPinned ? <span className="se-tag se-tag--warn">Pinned</span> : null}
      <span className="se-tag">{post.roundName ?? 'Global'}</span>
      {scheduled ? <span className="se-tag se-tag--warn">Scheduled</span> : null}
      <span className={`se-tag${post.discordPostedAt ? ' se-tag--good' : ''}`}>{post.discordPostedAt ? 'On Discord' : 'Discord pending'}</span>
      {post.forumUrl ? <a className="se-tag se-tag--good" href={post.forumUrl} target="_blank" rel="noreferrer">On forum</a>
        : post.forumError ? <span className="se-tag se-tag--bad" title={post.forumError}>Forum failed</span>
          : null}
    </span>
  );
}

export function AdminNewsPage() {
  const [news, setNews] = useState<AdminNewsDto | null>(null);
  const [banners, setBanners] = useState<AdminSiteBannersDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [post, setPost] = useState(emptyPost);
  const [postFields, setPostFields] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState(emptyBanner);
  const [bannerFields, setBannerFields] = useState<Record<string, string>>({});

  const [pending, setPending] = useState<Pending | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [newsResult, bannerResult] = await Promise.all([adminApi.news(), adminApi.banners()]);
      setNews(newsResult);
      setBanners(bannerResult);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load news and banners.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run<T>(action: () => Promise<T>, done: (result: T) => void, onFields?: (fields: Record<string, string>) => void) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      done(await action());
    } catch (caught) {
      if (caught instanceof ApiError) {
        onFields?.(caught.fields ?? {});
        setError(caught.message);
      } else {
        setError('That did not go through. Refresh before trying again.');
      }
    } finally {
      setBusy(false);
    }
  }

  function publish(event: FormEvent) {
    event.preventDefault();
    setPostFields({});
    const publishedAt = localInputToIso(post.publishAt);
    void run(
      () => adminApi.createNews({
        title: post.title.trim(),
        body: post.body.trim(),
        pinned: post.pinned,
        roundId: post.roundId || null,
        mirrorToForum: post.mirror,
        ...(publishedAt ? { publishedAt } : {}),
      }),
      (result) => {
        setNews(result);
        const created = result.posts[0];
        setPost((current) => ({ ...emptyPost, roundId: current.roundId }));
        setNotice(post.mirror && created?.forumError ? `News posted, but the forum mirror failed: ${created.forumError}` : 'News posted.');
      },
      setPostFields,
    );
  }

  function choose(kind: Pending['kind'], target: AdminNewsPostDto) {
    setPending({ kind, post: target });
    setEditTitle(target.title);
    setEditBody(target.body);
    setReason('');
    setError(null);
    setNotice(null);
  }

  function confirmPending(event: FormEvent) {
    event.preventDefault();
    if (!pending) return;
    if (pending.kind === 'delete') {
      void run(() => adminApi.deleteNews(pending.post.id, reason.trim()), (result) => {
        setNews(result);
        setPending(null);
        setNotice('News post deleted from the game.');
      });
      return;
    }
    void run(() => adminApi.updateNews(pending.post.id, { title: editTitle.trim(), body: editBody.trim() }), (result) => {
      setNews(result);
      setPending(null);
      setNotice('News post updated.');
    });
  }

  function togglePin(target: AdminNewsPostDto) {
    void run(() => adminApi.updateNews(target.id, { pinned: !target.isPinned }), (result) => {
      setNews(result);
      setNotice(target.isPinned ? 'Post unpinned.' : 'Post pinned.');
    });
  }

  function retryMirror(target: AdminNewsPostDto) {
    void run(() => adminApi.mirrorNews(target.id), (result) => {
      setNews(result);
      const updated = result.posts.find((row) => row.id === target.id);
      setNotice(updated?.forumUrl ? 'Posted to the forum.' : `The forum mirror failed again: ${updated?.forumError ?? 'unknown error'}`);
    });
  }

  function postBanner(event: FormEvent) {
    event.preventDefault();
    setBannerFields({});
    const endsAt = localInputToIso(banner.endsAt);
    const startsAt = localInputToIso(banner.startsAt);
    if (!endsAt) {
      setBannerFields({ endsAt: 'Pick when the banner ends.' });
      return;
    }
    void run(
      () => adminApi.createBanner({ message: banner.message.trim(), tone: banner.tone, endsAt, ...(startsAt ? { startsAt } : {}) }),
      (result) => {
        setBanners(result);
        setBanner(emptyBanner);
        setNotice('Banner posted.');
      },
      setBannerFields,
    );
  }

  function endBanner(bannerId: string) {
    void run(() => adminApi.endBanner(bannerId), (result) => {
      setBanners(result);
      setNotice('Banner ended.');
    });
  }

  const mirrorEnabled = news?.forumMirrorEnabled ?? false;

  return (
    <GameLayout>
      <div className="se-pagehead">
        <div>
          <h1 className="se-title">News & Banner</h1>
          <p className="se-eyebrow">Admin · news reaches the game, Discord and optionally the forum</p>
        </div>
      </div>

      {error ? <Alert>{error}</Alert> : null}
      {notice ? <p className="se-admin-notice" role="status">{notice}</p> : null}

      {pending ? (
        <Panel title={`${pending.kind === 'edit' ? 'Edit' : 'Delete'}: ${pending.post.title}`} className="se-mb">
          <form onSubmit={confirmPending} noValidate>
            {pending.kind === 'edit' ? (
              <>
                <Field id="admin-news-edit-title" label="Title" value={editTitle} onChange={(event) => setEditTitle(event.target.value)} maxLength={120} />
                <div className="se-field">
                  <label className="se-label" htmlFor="admin-news-edit-body">Body</label>
                  <textarea id="admin-news-edit-body" className="se-input se-admin-textarea" maxLength={4000} value={editBody} onChange={(event) => setEditBody(event.target.value)} />
                  <p className="se-hint">Copies already sent to Discord or the forum keep their original text.</p>
                </div>
              </>
            ) : (
              <>
                <p>Removes the post from the game. Copies already sent to Discord or the forum stay there.</p>
                <div className="se-field">
                  <label className="se-label" htmlFor="admin-news-delete-reason">Reason</label>
                  <textarea id="admin-news-delete-reason" className="se-input se-admin-reason" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
                  <p className="se-hint">Saved to the audit log. At least 5 characters.</p>
                </div>
              </>
            )}
            <div className="se-cta se-mt">
              <button
                className="se-btn se-btn--primary"
                disabled={busy || (pending.kind === 'delete' ? reason.trim().length < 5 : !editTitle.trim() || !editBody.trim())}
              >
                {busy ? 'Working...' : 'Confirm'}
              </button>
              <button type="button" className="se-btn se-btn--ghost" onClick={() => setPending(null)} disabled={busy}>Cancel</button>
            </div>
          </form>
        </Panel>
      ) : null}

      <div className="se-grid se-grid--2 se-mb">
        <Panel title="Post news">
          <form onSubmit={publish} noValidate>
            <Field id="admin-news-title" label="Title" value={post.title} onChange={(event) => setPost({ ...post, title: event.target.value })} maxLength={120} error={postFields.title} />
            <div className="se-field">
              <label className="se-label" htmlFor="admin-news-body">Body</label>
              <textarea id="admin-news-body" className="se-input se-admin-textarea" maxLength={4000} value={post.body} onChange={(event) => setPost({ ...post, body: event.target.value })} />
              {postFields.body ? <p className="se-error">{postFields.body}</p> : null}
            </div>
            <div className="se-field">
              <label className="se-label" htmlFor="admin-news-round">Shown in</label>
              <select id="admin-news-round" className="se-input" value={post.roundId} onChange={(event) => setPost({ ...post, roundId: event.target.value })}>
                <option value="">Every round (global)</option>
                {news?.rounds.map((round) => (
                  <option key={round.id} value={round.id}>{round.name} ({round.status.toLowerCase()})</option>
                ))}
              </select>
            </div>
            <Field
              id="admin-news-publish-at"
              label="Publish at"
              type="datetime-local"
              value={post.publishAt}
              onChange={(event) => setPost({ ...post, publishAt: event.target.value })}
              error={postFields.publishedAt}
              hint="Optional. Leave blank to publish now. Discord posts it once it is live."
            />
            <label className="se-checkrow se-checkrow--inline">
              <input type="checkbox" checked={post.pinned} onChange={(event) => setPost({ ...post, pinned: event.target.checked })} />
              <span><strong>Pin to the top</strong><small>Pinned posts sit above newer ones on the news page.</small></span>
            </label>
            <label className="se-checkrow se-checkrow--inline">
              <input type="checkbox" checked={post.mirror} disabled={!mirrorEnabled} onChange={(event) => setPost({ ...post, mirror: event.target.checked })} />
              <span>
                <strong>Also post to the forum</strong>
                <small>{mirrorEnabled ? 'Creates a discussion in the forum announcements tag.' : 'Off: set FORUM_API_KEY and FORUM_NEWS_TAG_ID on the server to enable.'}</small>
              </span>
            </label>
            <button className="se-btn se-btn--primary se-btn--block se-mt" disabled={busy || !news || !post.title.trim() || !post.body.trim()}>
              {busy ? 'Posting...' : 'Post news'}
            </button>
          </form>
        </Panel>

        <Panel title="Site banner">
          {banners?.current ? (
            <div className={`se-site-banner se-site-banner--${banners.current.tone} se-mb`}>
              <span>{banners.current.message}</span>
              <button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => endBanner(banners.current!.id)} disabled={busy}>End now</button>
            </div>
          ) : (
            <p className="se-hint">No banner is showing right now.</p>
          )}
          <form onSubmit={postBanner} noValidate>
            <div className="se-field">
              <label className="se-label" htmlFor="admin-banner-message">Message</label>
              <textarea id="admin-banner-message" className="se-input se-admin-reason" maxLength={280} value={banner.message} onChange={(event) => setBanner({ ...banner, message: event.target.value })} />
              {bannerFields.message ? <p className="se-error">{bannerFields.message}</p> : <p className="se-hint">Shown above every page, logged in or not. Up to 280 characters.</p>}
            </div>
            <div className="se-field">
              <label className="se-label" htmlFor="admin-banner-tone">Tone</label>
              <select id="admin-banner-tone" className="se-input" value={banner.tone} onChange={(event) => setBanner({ ...banner, tone: event.target.value as SiteBannerTone })}>
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <Field id="admin-banner-starts" label="Starts" type="datetime-local" value={banner.startsAt} onChange={(event) => setBanner({ ...banner, startsAt: event.target.value })} hint="Optional. Leave blank to show it now." />
            <Field id="admin-banner-ends" label="Ends" type="datetime-local" value={banner.endsAt} onChange={(event) => setBanner({ ...banner, endsAt: event.target.value })} error={bannerFields.endsAt} hint="Up to 30 days after it starts." />
            <button className="se-btn se-btn--primary se-btn--block" disabled={busy || banner.message.trim().length < 3}>Post banner</button>
          </form>
          {banners?.banners.length ? (
            <ol className="se-admin-audit se-mt">
              {banners.banners.slice(0, 5).map((row) => (
                <li className="se-admin-audit__entry" key={row.id}>
                  <div className="se-admin-audit__head">
                    <strong>{row.tone}</strong>
                    <span className="se-muted">{adminWhen(row.startsAt)} → {adminWhen(row.endsAt)}</span>
                  </div>
                  <p>{row.message}</p>
                  <p className="se-hint">By {row.createdByUsername}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </Panel>
      </div>

      <Panel title="Posts" aside={news ? `${news.posts.length} latest` : undefined} flush>
        {!news ? (
          <p className="se-muted se-admin-pad">Loading news...</p>
        ) : news.posts.length === 0 ? (
          <p className="se-muted se-admin-pad">No news posted yet.</p>
        ) : (
          news.posts.map((row) => (
            <article className="se-admin-news" key={row.id}>
              <div className="se-admin-audit__head">
                <h3>{row.title}</h3>
                <span className="se-muted">{adminWhen(row.publishedAt)}</span>
              </div>
              <PostTags post={row} />
              <p>{row.body.length > 280 ? `${row.body.slice(0, 280)}…` : row.body}</p>
              <p className="se-hint">{row.authorName ? `By ${row.authorName}` : 'Seeded'}{row.forumError && !row.forumUrl ? ` · Forum error: ${row.forumError}` : ''}</p>
              <div className="se-admin-moderation se-mt">
                <button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => togglePin(row)} disabled={busy}>{row.isPinned ? 'Unpin' : 'Pin'}</button>
                <button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => choose('edit', row)} disabled={busy}>Edit</button>
                {mirrorEnabled && !row.forumUrl ? (
                  <button type="button" className="se-btn se-btn--sm se-btn--ghost" onClick={() => retryMirror(row)} disabled={busy}>
                    {row.forumError ? 'Retry forum' : 'Post to forum'}
                  </button>
                ) : null}
                <button type="button" className="se-btn se-btn--sm" onClick={() => choose('delete', row)} disabled={busy}>Delete</button>
              </div>
            </article>
          ))
        )}
      </Panel>
    </GameLayout>
  );
}
