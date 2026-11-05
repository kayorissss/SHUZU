/** Список серверов: поиск, фильтры, замер пинга, избранное. */
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { countryName, getCountry } from '../../shared/countries';
import { pingSummary, qualityOf } from '../../shared/quality';
import ScreenHeader from '../components/ScreenHeader';
import ServerRow from '../components/ServerRow';
import { Empty } from '../components/ui';
import { IconActivity, IconPlus, IconSearch, IconServer, IconX } from '../components/Icons';

type Sort = 'ping' | 'name' | 'country';

export default function Servers() {
  const servers = useApp((s) => s.servers);
  const conn = useApp((s) => s.conn);
  const search = useApp((s) => s.search);
  const setSearch = useApp((s) => s.setSearch);
  const filterFavorites = useApp((s) => s.filterFavorites);
  const setFilterFavorites = useApp((s) => s.setFilterFavorites);
  const pinging = useApp((s) => s.pinging);
  const pingingIds = useApp((s) => s.pingingIds);
  const pingAll = useApp((s) => s.pingAll);
  const pingServer = useApp((s) => s.pingServer);
  const selectServer = useApp((s) => s.selectServer);
  const toggleFavorite = useApp((s) => s.toggleFavorite);
  const openModal = useApp((s) => s.openModal);
  const go = useApp((s) => s.go);

  const [sort, setSort] = useState<Sort>('ping');
  const [country, setCountry] = useState<string | null>(null);

  const summary = useMemo(() => pingSummary(servers), [servers]);

  const countries = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of servers) {
      if (!s.country) continue;
      map.set(s.country, (map.get(s.country) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [servers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = servers.filter((s) => {
      if (filterFavorites && !s.favorite) return false;
      if (country && s.country !== country) return false;
      if (!q) return true;
      const haystack = [s.cleanName, s.name, s.city ?? '', countryName(s.country, 'ru'), countryName(s.country, 'en'), s.host, s.protocol].join(' ').toLowerCase();
      return haystack.includes(q);
    });
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.cleanName.localeCompare(b.cleanName, 'ru');
      if (sort === 'country') {
        const ca = countryName(a.country, 'ru');
        const cb = countryName(b.country, 'ru');
        return ca.localeCompare(cb, 'ru') || (a.ping ?? 9999) - (b.ping ?? 9999);
      }
      const pa = a.tunnelPing ?? a.ping ?? 9999;
      const pb = b.tunnelPing ?? b.ping ?? 9999;
      return pa - pb;
    });
    return list;
  }, [servers, search, filterFavorites, country, sort]);

  const favorites = filtered.filter((s) => s.favorite);
  const others = filtered.filter((s) => !s.favorite);

  const renderList = (list: typeof filtered, offset = 0) =>
    list.map((s, i) => (
      <ServerRow
        key={s.id}
        index={i + offset}
        server={s}
        selected={s.id === conn.serverId}
        measuring={pingingIds.includes(s.id)}
        showCountryName
        onClick={() => {
          if (s.ping == null) void pingServer(s.id);
          void selectServer(s.id);
        }}
        onStar={() => void toggleFavorite(s.id)}
        onInfo={() => openModal({ name: 'serverDetails', serverId: s.id })}
      />
    ));

  return (
    <>
      <ScreenHeader
        title="Серверы"
        back="home"
        actions={
          <>
            <button
              className={`iconbtn${pinging ? ' is-accent' : ''}`}
              onClick={() => void pingAll()}
              disabled={pinging || !servers.length}
              aria-label="Проверить пинг всех серверов"
              title="Проверить пинг всех серверов"
            >
              <IconActivity />
            </button>
            <button className="iconbtn" onClick={() => openModal({ name: 'addSub' })} aria-label="Добавить подписку">
              <IconPlus />
            </button>
          </>
        }
      />

      <div className="servers">
        <div className="search">
          <IconSearch />
          <input
            className="input"
            placeholder="Поиск: страна, город, название"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            spellCheck={false}
          />
          {search && (
            <button className="search__clear" onClick={() => setSearch('')} aria-label="Очистить">
              <IconX width={14} height={14} />
            </button>
          )}
        </div>

        <div className="chips">
          <button className={`chip${!filterFavorites && !country ? ' is-active' : ''}`} onClick={() => { setFilterFavorites(false); setCountry(null); }}>
            Все <span className="chip__count">{servers.length}</span>
          </button>
          <button className={`chip${filterFavorites ? ' is-active' : ''}`} onClick={() => setFilterFavorites(!filterFavorites)}>
            ★ Избранное <span className="chip__count">{servers.filter((s) => s.favorite).length}</span>
          </button>
          {countries.slice(0, 12).map(([code, count]) => {
            const c = getCountry(code);
            return (
              <button
                key={code}
                className={`chip${country === code ? ' is-active' : ''}`}
                onClick={() => setCountry(country === code ? null : code)}
              >
                <img className="flag flag--round" style={{ width: 15, height: 15 }} src={`/flags/${code.toLowerCase()}.svg`} alt="" />
                {c?.ru ?? code} <span className="chip__count">{count}</span>
              </button>
            );
          })}
        </div>

        <div className="servers__toolbar">
          <div className="seg" style={{ flex: 1 }}>
            {(
              [
                ['ping', 'По пингу'],
                ['name', 'По имени'],
                ['country', 'По стране'],
              ] as Array<[Sort, string]>
            ).map(([v, label]) => (
              <button key={v} className={`seg__item${sort === v ? ' is-active' : ''}`} onClick={() => setSort(v)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {servers.length > 0 && (
          <div className="row-gap-8 small dim" style={{ padding: '0 4px' }}>
            <span>
              Лучший: <b style={{ color: 'var(--accent)' }}>{summary.best != null ? `${summary.best} мс` : '—'}</b>
            </span>
            <span className="dotsep" />
            <span>Средний: {summary.avg != null ? `${summary.avg} мс` : '—'}</span>
            <div className="spacer" />
            <button className="linkbtn" onClick={() => void pingAll()} disabled={pinging}>
              {pinging ? 'Замеряем…' : 'Замерить пинг'}
            </button>
          </div>
        )}

        {!servers.length ? (
          <Empty
            icon={<IconServer />}
            title="Серверов пока нет"
            text="Добавьте подписку из буфера обмена, по QR-коду или файлом — серверы появятся здесь автоматически."
            action={
              <button className="btn btn--primary btn--sm" onClick={() => openModal({ name: 'addSub' })} style={{ marginTop: 6 }}>
                <IconPlus width={15} height={15} />
                Добавить
              </button>
            }
          />
        ) : !filtered.length ? (
          <Empty icon={<IconSearch />} title="Ничего не найдено" text="Попробуйте изменить запрос или сбросить фильтры." />
        ) : (
          <>
            {favorites.length > 0 && (
              <div className="section">
                <div className="group-label">Избранное</div>
                <div className="card">{renderList(favorites)}</div>
              </div>
            )}
            <div className="section">
              {favorites.length > 0 && <div className="group-label">Все остальные</div>}
              <div className="card">{renderList(others, favorites.length)}</div>
            </div>
          </>
        )}

        <motion.button
          className="btn btn--ghost btn--sm"
          style={{ marginTop: 4 }}
          onClick={() => go('censor')}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          Проверить, не глушат ли интернет
        </motion.button>
      </div>
    </>
  );
}
