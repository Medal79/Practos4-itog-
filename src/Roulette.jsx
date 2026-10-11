import { useState, useRef, useMemo, useEffect } from 'react';
import { rarityColor } from './rarity';
import Img from './Img';
import { api } from './api';
import { useAuth } from './AuthContext';

const ITEM_W = 140;
const GAP = 8;
const TAPE_LEN = 56;
const WIN_INDEX = 46;
// Длительность прокрутки рулетки, мс
export const SPIN_MS = 6000;

// Случайный предмет из кейса — для заполнения ленты рулетки
function randomFiller(pool) {
  const total = pool.reduce((s, i) => s + i.drop_chance, 0);
  let roll = Math.random() * total;
  for (const item of pool) {
    roll -= item.drop_chance;
    if (roll < 0) return item;
  }
  return pool[pool.length - 1];
}

/**
 * Рулетка одного кейса. Выпавший предмет заранее выбрал сервер,
 * анимация только красиво подводит ленту к нему.
 */
function Roulette({ opening, onOpened }) {
  const { won, pool, case_name } = opening;
  const { token } = useAuth();
  // Если кейс уже был открыт раньше — сразу показываем результат
  const [phase, setPhase] = useState(opening.opened ? 'done' : 'idle');
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [currentVideo, setCurrentVideo] = useState("");
  
  const viewportRef = useRef(null);
  const timerRef = useRef(null);
  const videoRef = useRef(null);

  const tape = useMemo(() => {
    const filler = pool.length ? pool : [won];
    return Array.from({ length: TAPE_LEN }, (_, i) => (i === WIN_INDEX ? won : randomFiller(filler)));
  }, [pool, won]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  useEffect(() => {
    if (phase === 'video' && videoRef.current) {
      videoRef.current.play().catch(e => console.log(e));
    }
  }, [phase]);

  // Анимация закончилась — показываем выпавший предмет
  function finish() {
    clearTimeout(timerRef.current);
    
    const characterName = won.name ? won.name.toLowerCase() : "";

    if (characterName.includes('арлекино')) {
      setCurrentVideo('/arlecchino.mp4');
      setPhase('video');
    } else if (characterName.includes('нёвиллет')) {
      setCurrentVideo('/neuvillette.mp4');
      setPhase('video');
    } else {
      finishCompletely();
    }
  }

  // Завершить открытие: сервер кладёт предмет в инвентарь и только после этого показываем результат
  async function finishCompletely() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveError('');
    setPhase('saving');
    try {
      await api(`/inventory/${opening.id}/open`, { method: 'POST', token });
      setPhase('done');
      if (onOpened) onOpened(opening);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      savingRef.current = false;
    }
  }

  // Запустить прокрутку ленты
  function spin() {
    const viewportW = viewportRef.current ? viewportRef.current.offsetWidth : 800;
    const jitter = (Math.random() - 0.5) * (ITEM_W * 0.7);
    const target = WIN_INDEX * (ITEM_W + GAP) + ITEM_W / 2 - viewportW / 2 + jitter;
    setPhase('spinning');
    requestAnimationFrame(() => setOffset(target));
    timerRef.current = setTimeout(finish, SPIN_MS + 200);
  }

  return (
    <div className="roulette-box">
      
      {phase === 'video' && (
        <div style={overlayStyle}>
          <video
            ref={videoRef}
            src={currentVideo}
            autoPlay
            muted
            playsInline
            onEnded={finishCompletely}
            style={videoStyle}
          />
          <button onClick={finishCompletely} style={skipVideoBtnStyle}>
            Пропустить анимацию
          </button>
        </div>
      )}

      <h3>{case_name}</h3>

      <div className="roulette-viewport" ref={viewportRef}>
        <div className="roulette-pointer" />
        <div
          className="roulette-tape"
          style={{
            transform: `translateX(${-offset}px)`,
            transition: phase === 'spinning' ? `transform ${SPIN_MS}ms cubic-bezier(0.12, 0.6, 0.1, 1)` : 'none',
          }}
        >
          {tape.map((it, i) => (
            <div className="roulette-item" key={i} style={{ borderBottomColor: rarityColor(it.rarity) }}>
              <Img className="roulette-img" src={it.image_url} alt={it.name} fallback="🔫" />
              <span>{it.name}</span>
            </div>
          ))}
        </div>
      </div>

      {phase === 'idle' && (
        <div className="roulette-actions">
          <button className="primary" onClick={spin}>Открыть кейс</button>
        </div>
      )}
      {phase === 'spinning' && (
        <div className="roulette-actions">
          <button onClick={finish}>Пропустить рулетку</button>
        </div>
      )}
      {phase === 'saving' && (
        <div className="roulette-actions">
          {saveError ? (
            <div className="error">
              <p>Ошибка: {saveError}</p>
              <button onClick={finishCompletely}>Попробовать снова</button>
            </div>
          ) : (
            <p className="muted">Добавляем предмет в инвентарь...</p>
          )}
        </div>
      )}
      {phase === 'done' && (
        <div className="roulette-result" style={{ borderColor: rarityColor(won.rarity) }} data-testid="result">
          <Img className="result-img" src={won.image_url} alt={won.name} fallback="🔫" />
          <div>
            <p className="muted">Вам выпало:</p>
            <h2 style={{ color: rarityColor(won.rarity) }}>{won.name}</h2>
            <p style={{ color: rarityColor(won.rarity) }}>{won.rarity}</p>
            <p className="muted">≈ {won.value_price.toLocaleString('ru-RU')} руб.</p>
          </div>
        </div>
      )}
    </div>
  );
}

const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  backgroundColor: 'rgba(0, 0, 0, 0.95)',
  zIndex: 9999,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
};

const videoStyle = {
  maxWidth: '100%',
  maxHeight: '80vh',
  outline: 'none',
};

const skipVideoBtnStyle = {
  marginTop: '20px',
  padding: '10px 20px',
  fontSize: '16px',
  cursor: 'pointer',
  backgroundColor: 'rgba(255, 255, 255, 0.1)',
  color: '#fff',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  borderRadius: '8px',
  transition: 'background 0.2s',
};

export default Roulette;