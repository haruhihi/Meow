'use client';
import { useState, useEffect } from 'react';
import { Avatar, Button } from 'antd-mobile';
import { useRouter } from 'next/navigation';
import { useUserInfo } from '@utils/user';
import { ECardNum, ECardType, initGame } from './help';
import styles from './index.module.scss';
export default function App() {
  const [game, setGame] = useState(initGame);
  const { currentRound, records, players, commonCards } = game;
  const record = records.find((r) => r.round === currentRound);
  if (!record) {
    return 'unkown round';
  }
  const { round, roundName } = record;
  if (!round)
    return (
      <div className={styles.wrap}>
        <div className={styles.header}>
          <h1>德州扑克</h1>
          <h2>
            这是第{round}轮: {roundName}
          </h2>
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
              {players.map((player, index) => {
                return (
                  <div
                    key={player.uid}
                    className={styles.player}
                    style={{
                      left: index < 3 ? 0 : 'auto',
                      right: index < 3 ? 'auto' : 0,
                      top:
                        index < 3
                          ? `calc(var(--container-height) / 3  * ${index})`
                          : `calc(var(--container-height) / 3  * ${index - 3})`,
                    }}
                  >
                    <div className={styles.avatar}>PJL</div>
                    <div  className={styles.bet}>5000</div>
                    <div className={styles.cards}>
                      <img src="/poker/7_of_spades.svg" alt="1" width="100%" />
                      <img src="/poker/7_of_spades.svg" alt="1" width="100%" />
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
              {players[0].cards.map(([num, type], index) => {
                return <img height="40px" width="50px" src={`/poker/${num}_of_${type}.svg`} alt="1" key={index} />;
              })}
            </div>
          </div>
          <div className={styles.actions}>
            <Button>下一轮</Button>
            <Button>加注</Button>
            <Button>跟注</Button>
            <Button>弃牌</Button>
          </div>
        </div>
      </div>
    );
}
