/* Plain JavaScript using Flarum 1.8's public compatibility exports; no build step. */
(function () {
  'use strict';
  const compat = flarum.core.compat;
  const app = compat['forum/app'];
  const Page = compat['common/components/Page'];
  const UserCard = compat['forum/components/UserCard'];
  const LogInModal = compat['forum/components/LogInModal'];
  const extend = compat['common/extend'].extend;
  const storageKey = 'street-empire-link-request';

  app.initializers.add('street-empire-profile-link', function () {
    class LinkPage extends Page {
      oninit(vnode) {
        super.oninit(vnode);
        this.busy = false;
        this.error = null;
        this.preview = null;
        const incoming = new URLSearchParams(window.location.hash.slice(1)).get('request');
        // Preserve across Flarum's login reload, never indefinitely.
        try {
          if (incoming) sessionStorage.setItem(storageKey, JSON.stringify({ token: incoming, expires: Date.now() + 600000 }));
          const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
          this.token = incoming || (saved && saved.expires > Date.now() ? saved.token : '');
          if (!this.token) sessionStorage.removeItem(storageKey);
        } catch (_) { this.token = incoming || ''; }
        window.history.replaceState(window.history.state, '', window.location.pathname);
        app.setTitle('Link game profile');
        if (app.session.user && this.token && app.forum.attribute('streetEmpireLinkEnabled')) this.loadPreview();
      }
      async loadPreview() {
        this.busy = true;
        try {
          this.preview = await app.request({ method: 'POST', url: app.forum.attribute('apiUrl') + '/street-empire/preview', body: { request: this.token } });
        } catch (_) { this.error = 'Could not verify this request. Return to the game and start linking again.'; }
        finally { this.busy = false; m.redraw(); }
      }
      async confirm() {
        this.busy = true;
        this.error = null;
        try {
          const result = await app.request({ method: 'POST', url: app.forum.attribute('apiUrl') + '/street-empire/confirm', body: { request: this.token, forumUserId: this.preview.forumUserId } });
          const destination = new URL(result.url);
          if (destination.origin !== app.forum.attribute('streetEmpireGameOrigin') || destination.pathname !== '/account/forum-link') throw new Error('Invalid destination');
          try { sessionStorage.removeItem(storageKey); } catch (_) {}
          window.location.assign(destination.href);
        } catch (_) { this.error = 'Could not confirm the connection. Return to the game and start again.'; this.busy = false; m.redraw(); }
      }
      view() {
        const game = app.forum.attribute('streetEmpireGameOrigin');
        return m('div.container.StreetEmpireLink', [
          m('h2', 'Link your game profile'),
          this.error ? m('p.Alert', { role: 'alert' }, this.error) : null,
          !app.forum.attribute('streetEmpireLinkEnabled') ? m('p', 'Forum linking is not available yet.') : !this.token ? m('p', 'Start linking from your game account settings.') : !app.session.user ? [
            m('p', 'Sign into the forum account you want to connect. Then return here to confirm.'),
            m('button.Button.Button--primary', { onclick: () => app.modal.show(LogInModal) }, 'Log in to the forum'),
          ] : this.preview ? [
            m('p', ['Connect game account ', m('strong', this.preview.gameUsername), ' to forum account ', m('strong', this.preview.forumUsername), '?']),
            m('p', 'Both profiles will show a public link to each other, your forum profile will show your Street Empire badges, and your game profile will show your forum role. Email and Discord details stay private. You can unlink from your game account settings.'),
            m('button.Button.Button--primary', { disabled: this.busy, onclick: () => this.confirm() }, this.busy ? 'Connecting...' : 'Confirm these accounts'),
          ] : this.busy ? m('p', { role: 'status' }, 'Checking request...') : null,
          game ? m('p', m('a', { href: game + '/account', onclick: () => { try { sessionStorage.removeItem(storageKey); } catch (_) {} } }, 'Cancel / back to game account')) : null,
        ]);
      }
    }
    app.routes['street-empire.link'] = { path: '/street-empire/link', component: LinkPage };

    // Hover cards re-run oninit on every open; look each user up once per page load.
    const profileLookups = new Map();
    const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    extend(UserCard.prototype, 'oninit', function () {
      this.streetEmpireUrl = null;
      this.streetEmpireBadges = [];
      if (!app.forum.attribute('streetEmpireLinkEnabled')) return;
      const id = this.attrs.user.id();
      const expected = app.forum.attribute('streetEmpireGameOrigin') + '/game/forum/' + id;
      if (!profileLookups.has(id)) {
        profileLookups.set(id, app.request({ method: 'GET', url: app.forum.attribute('apiUrl') + '/street-empire/users/' + encodeURIComponent(id) })
          .then((result) => (result.profileUrl === expected
            ? { url: expected, badges: Array.isArray(result.badges) ? result.badges.slice(0, 6) : [] }
            : null))
          .catch(() => { profileLookups.delete(id); return null; }));
      }
      profileLookups.get(id).then((found) => {
        if (!found) return;
        this.streetEmpireUrl = found.url;
        this.streetEmpireBadges = found.badges;
        m.redraw();
      });
    });
    extend(UserCard.prototype, 'infoItems', function (items) {
      if (this.streetEmpireUrl) items.add('streetEmpireProfile', m('a', { href: this.streetEmpireUrl, className: 'StreetEmpireProfileLink' }, 'Game Profile'), 80);
      if (this.streetEmpireBadges.length) {
        // Mithril escapes text; the rarity is allowlisted before it becomes a class.
        items.add('streetEmpireBadges', m('ul.StreetEmpireBadges', { 'aria-label': 'Street Empire badges' },
          this.streetEmpireBadges.map((badge) => m('li.StreetEmpireBadge', {
            key: badge.key,
            className: 'StreetEmpireBadge--' + (rarities.includes(badge.rarity) ? badge.rarity : 'common') + (badge.permanent ? ' StreetEmpireBadge--permanent' : ''),
            title: badge.description + (badge.permanent ? ' Permanent badge.' : ' Earned this round.'),
          }, badge.title))), 70);
      }
    });
  });

  // Flarum wraps extension JS as `var module={}; ...; flarum.extensions[id]=module.exports`
  // and its boot code reads `.extend` on that entry, so it must be an object.
  module.exports = {};
})();
