'use client';
import { Button } from 'antd-mobile';
import { useUserInfo } from '@utils/user';
import { getLabel, getPlayers } from './help';
import styles from './index.module.scss';
import { TopLoading } from '@components/loading';
import { Card } from './card';
import { observer } from 'mobx-react-lite';
import { createContext, useContext } from 'react';
import { Game } from './game';

const GameContext = createContext<Game | null>(null);

const Texas = observer(() => {
  const game = useContext(GameContext);
  const { user } = useUserInfo();

  if (!game || !user) {
    return <TopLoading />;
  }
  const { currentRound, records, players, commonCards } = game;

  console.log(game);
  const { id: currentUID } = user;

  const { me, otherPlayers } = getPlayers(game, currentUID);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2>{game.getRound()}</h2>
      </div>
      <div className={styles.tableContainer}>
        <div className={styles.alignContainer}>
          <div className={styles.table} />
        </div>
        <div className={styles.alignContainer}>
          <div className={styles.commonCards}>
            {commonCards.map(([num, type], index) => {
              return <img className={styles.card} src={`/poker/${num}_of_${type}.svg`} alt="1" key={index} />;
            })}
          </div>
        </div>
        <div className={styles.alignContainer}>
          <div className={styles.players}>
            {otherPlayers.map((player, index) => {
              const { name, cards } = player;
              const label = getLabel(player, players, game);
              return (
                <div
                  key={player.uid}
                  className={styles.player}
                  style={{
                    left: index >= 3 ? 0 : 'auto',
                    right: index >= 3 ? 'auto' : 0,
                    top:
                      index < 3
                        ? `calc(var(--container-height) / 3  * ${index})`
                        : `calc(var(--container-height) / 3  * ${5 - index})`,
                  }}
                >
                  <div className={styles.avatar}>{name}</div>
                  <div className={styles.bet}>{label} 5000</div>
                  <div className={styles.cards}>
                    <img src={`/poker/${cards[0][0]}_of_${cards[0][1]}.svg`} alt="1" width="100%" />
                    <img src={`/poker/${cards[1][0]}_of_${cards[1][1]}.svg`} alt="1" width="100%" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className={styles.footer}>
        <div className={styles.cards}>
          <div style={{ display: 'flex', gap: 4 }}>
            {me.cards.map(([num, type], index) => {
              return <Card num={num} type={type} key={index} />;
            })}
          </div>
        </div>
        {me.name}
        {getLabel(me, players, game)}
        <div className={styles.actions}>
          <Button>下一轮</Button>
          <Button>加注</Button>
          <Button>跟注</Button>
          <Button onClick={() => {}}>弃牌</Button>
        </div>
      </div>
    </div>
  );
});

const App = () => {
  return (
    <GameContext.Provider value={new Game()}>
      <Texas />
    </GameContext.Provider>
  );
};

export default App;

// fill="#d40000" → fill="#0044cc" （蓝色背景）
// stroke="white" → stroke="gold" （金色边框）
// 修改 pattern 的 width="20" 和 height="20" 来调整网格密度。
