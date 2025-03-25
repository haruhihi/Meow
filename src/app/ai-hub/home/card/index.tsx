import React from 'react';
import styles from './index.module.scss';
import { Icon } from '../icon';
import { AI_Tool } from '@prisma/client';

export const Card: React.FC<{ item: AI_Tool }> = (props) => {
  const {
    item: { icon, name, link, desc, category1 },
  } = props;

  return (
    <a className={styles.wrap} href={link} target="_blank">
      <div className={styles.title}>
        <div className={styles.iconWrap}>
          <Icon source={icon} className={styles.icon} category1={category1} />
        </div>
        <div>{name}</div>
      </div>
      <p className={styles.desc}>{desc}</p>
    </a>
  );
};
