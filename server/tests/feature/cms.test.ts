import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { auth, closeDatabase, makeAdmin, makeUser, request, resetDatabase } from '../helpers/app.js';
import { News, Player, SiteString } from '../../src/models/index.js';

beforeEach(resetDatabase);
afterAll(closeDatabase);

async function seedPlayer(overrides: Record<string, unknown> = {}) {
  return Player.create({
    nameEn: 'Magnus Carlsen',
    nameAr: 'ماغنوس كارلسن',
    country: 'Norway',
    rating: 2830,
    title: 'GM',
    ...overrides,
  });
}

describe('players', () => {
  it('lists players highest-rated first with unrated last', async () => {
    await seedPlayer({ nameEn: 'Unrated', nameAr: 'بدون', rating: null });
    await seedPlayer({ nameEn: 'Mid', nameAr: 'وسط', rating: 2500 });
    await seedPlayer({ nameEn: 'Top', nameAr: 'قمة', rating: 2800 });

    const res = await (await request()).get('/api/players');

    expect(res.status).toBe(200);
    expect(res.body.players.map((p: { name_en: string }) => p.name_en)).toEqual([
      'Top',
      'Mid',
      'Unrated',
    ]);
    expect(res.body.total).toBe(3);
  });

  it('returns the requested language in the `name` field', async () => {
    await seedPlayer();

    const en = await (await request()).get('/api/players?lang=en');
    const ar = await (await request()).get('/api/players?lang=ar');

    expect(en.body.players[0].name).toBe('Magnus Carlsen');
    expect(ar.body.players[0].name).toBe('ماغنوس كارلسن');
    // Both language variants are always present for the admin forms.
    expect(ar.body.players[0].name_en).toBe('Magnus Carlsen');
  });

  it('searches both language names', async () => {
    await seedPlayer();
    const byArabic = await (await request()).get('/api/players?search=كارلسن');
    expect(byArabic.body.players).toHaveLength(1);
  });

  it('treats a regex metacharacter in search as a literal', async () => {
    await seedPlayer();
    // Would match everything if the input were interpolated into the pattern.
    const res = await (await request()).get('/api/players?search=.*');
    expect(res.body.players).toHaveLength(0);
  });

  it('requires an admin token to create', async () => {
    const { token } = await makeUser();
    const anonymous = await (await request()).post('/api/players').send({ name_en: 'x', name_ar: 'x' });
    const asPlayer = await (await request())
      .post('/api/players')
      .set(...auth(token))
      .send({ name_en: 'x', name_ar: 'x' });

    expect(anonymous.status).toBe(401);
    expect(asPlayer.status).toBe(403);
  });

  it('creates a player and stores the date of birth as a calendar day', async () => {
    const { token } = await makeAdmin();

    const res = await (await request())
      .post('/api/players')
      .set(...auth(token))
      .send({
        name_en: 'Ding Liren',
        name_ar: 'دينغ ليرين',
        rating: 2780,
        title: 'GM',
        date_of_birth: '1992-10-24',
      });

    expect(res.status).toBe(201);
    // The stored day must not shift with the server's timezone.
    expect(res.body.date_of_birth).toBe('1992-10-24');
  });

  it('rejects a malformed date of birth instead of storing garbage', async () => {
    const { token } = await makeAdmin();
    const res = await (await request())
      .post('/api/players')
      .set(...auth(token))
      .send({ name_en: 'x', name_ar: 'x', date_of_birth: 'yesterday' });

    expect(res.status).toBe(422);
  });

  it('keeps the spotlight flags exclusive', async () => {
    const { token } = await makeAdmin();
    const first = await seedPlayer({ isPlayerOfMonth: true });
    const second = await seedPlayer({ nameEn: 'Second', nameAr: 'ثاني' });

    await (await request())
      .put(`/api/players/${second._id}`)
      .set(...auth(token))
      .send({ is_player_of_month: true });

    expect((await Player.findById(first._id))?.isPlayerOfMonth).toBe(false);
    expect((await Player.findById(second._id))?.isPlayerOfMonth).toBe(true);

    const homepage = await (await request()).get('/api/players/homepage');
    expect(homepage.body.player_of_month.name_en).toBe('Second');
  });

  it('clears account links when a profile is deleted', async () => {
    const { token } = await makeAdmin();
    const player = await seedPlayer();
    const { user } = await makeUser();
    user.linkedPlayerId = player._id;
    await user.save();

    await (await request())
      .delete(`/api/players/${player._id}`)
      .set(...auth(token));

    const { User } = await import('../../src/models/index.js');
    expect((await User.findById(user._id))?.linkedPlayerId).toBeNull();
  });

  it('404s on an unknown id and 400s on a malformed one', async () => {
    expect((await (await request()).get('/api/players/64b8f0000000000000000000')).status).toBe(404);
    expect((await (await request()).get('/api/players/not-an-id')).status).toBe(422);
  });
});

describe('news', () => {
  it('shows only published articles for the requested language edition', async () => {
    await News.create({ titleEn: 'EN only', region: 'en', published: true, publishedAt: new Date() });
    await News.create({ titleAr: 'AR only', region: 'ar', published: true, publishedAt: new Date() });
    await News.create({ titleEn: 'Both', region: 'both', published: true, publishedAt: new Date() });
    await News.create({ titleEn: 'Draft', region: 'both', published: false });

    const en = await (await request()).get('/api/news?lang=en');
    const ar = await (await request()).get('/api/news?lang=ar');

    expect(en.body.news.map((n: { title_en: string }) => n.title_en).sort()).toEqual(['Both', 'EN only']);
    expect(ar.body.total).toBe(2);
    expect(en.body.news.some((n: { title_en: string }) => n.title_en === 'Draft')).toBe(false);
  });

  it('hides an unpublished article from the public but shows it to an admin', async () => {
    const { token } = await makeAdmin();
    const draft = await News.create({ titleEn: 'Draft', region: 'both', published: false });

    expect((await (await request()).get(`/api/news/${draft._id}`)).status).toBe(404);
    expect(
      (await (await request()).get(`/api/news/${draft._id}`).set(...auth(token))).status,
    ).toBe(200);
  });

  it('stamps published_at on first publish and keeps it on later edits', async () => {
    const { token } = await makeAdmin();
    const article = await News.create({ titleEn: 'Later', region: 'both', published: false });

    const published = await (await request())
      .put(`/api/news/${article._id}`)
      .set(...auth(token))
      .send({ published: true });
    const firstStamp = published.body.published_at;
    expect(firstStamp).not.toBeNull();

    const edited = await (await request())
      .put(`/api/news/${article._id}`)
      .set(...auth(token))
      .send({ title_en: 'Edited', published: true });

    expect(edited.body.published_at).toBe(firstStamp);
  });

  it('keeps only one featured article', async () => {
    const { token } = await makeAdmin();
    const first = await News.create({ titleEn: 'A', region: 'both', isFeatured: true });
    const second = await News.create({ titleEn: 'B', region: 'both' });

    await (await request())
      .put(`/api/news/${second._id}`)
      .set(...auth(token))
      .send({ is_featured: true });

    expect((await News.findById(first._id))?.isFeatured).toBe(false);
  });

  it('resolves the linked player name without a query per article', async () => {
    const player = await seedPlayer();
    await News.create({
      titleEn: 'About Magnus',
      region: 'both',
      published: true,
      publishedAt: new Date(),
      playerId: player._id,
    });

    const res = await (await request()).get('/api/news?lang=ar');
    expect(res.body.news[0].player_name).toBe('ماغنوس كارلسن');
  });
});

describe('site strings', () => {
  it('groups overrides by language for the SPA', async () => {
    await SiteString.create({ key: 'nav.home', lang: 'en', value: 'Home' });
    await SiteString.create({ key: 'nav.home', lang: 'ar', value: 'الرئيسية' });

    const res = await (await request()).get('/api/strings');

    expect(res.body).toEqual({ en: { 'nav.home': 'Home' }, ar: { 'nav.home': 'الرئيسية' } });
  });

  it('upserts a bulk save in one round trip', async () => {
    const { token } = await makeAdmin();
    await SiteString.create({ key: 'nav.home', lang: 'en', value: 'Home' });

    const res = await (await request())
      .put('/api/strings/bulk')
      .set(...auth(token))
      .send({
        strings: [
          { key: 'nav.home', lang: 'en', value: 'Start' },
          { key: 'nav.play', lang: 'en', value: 'Play' },
        ],
      });

    expect(res.status).toBe(200);
    expect(await SiteString.countDocuments()).toBe(2);
    expect((await SiteString.findOne({ key: 'nav.home', lang: 'en' }))?.value).toBe('Start');
  });

  it('rejects a key with a path separator', async () => {
    const { token } = await makeAdmin();
    const res = await (await request())
      .post('/api/strings')
      .set(...auth(token))
      .send({ key: '../../etc/passwd', value_en: 'x' });

    expect(res.status).toBe(422);
  });
});

describe('image upload', () => {
  async function pngBuffer(width = 32, height = 32) {
    return sharp({
      create: { width, height, channels: 3, background: { r: 20, g: 30, b: 40 } },
    })
      .png()
      .toBuffer();
  }

  it('accepts a real image and returns a random filename', async () => {
    const { token } = await makeAdmin();

    const res = await (await request())
      .post('/api/upload/image')
      .set(...auth(token))
      .attach('file', await pngBuffer(), 'photo.png');

    expect(res.status).toBe(201);
    // Re-encoded to webp under a UUID, never the client's filename.
    expect(res.body.url).toMatch(/^\/uploads\/[0-9a-f-]{36}\.webp$/);
    expect(res.body.url).not.toContain('photo');
  });

  it('rejects a non-image renamed to look like one', async () => {
    const { token } = await makeAdmin();

    const res = await (await request())
      .post('/api/upload/image')
      .set(...auth(token))
      .attach('file', Buffer.from('<?php system($_GET["c"]); ?>'), {
        filename: 'shell.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
  });

  it('downscales an oversized image', async () => {
    const { token } = await makeAdmin();

    const res = await (await request())
      .post('/api/upload/image')
      .set(...auth(token))
      .attach('file', await pngBuffer(4000, 3000), 'big.png');

    expect(res.status).toBe(201);
    expect(res.body.width).toBeLessThanOrEqual(2400);
  });

  it('requires an admin', async () => {
    const { token } = await makeUser();
    const res = await (await request())
      .post('/api/upload/image')
      .set(...auth(token))
      .attach('file', await pngBuffer(), 'photo.png');

    expect(res.status).toBe(403);
  });
});
