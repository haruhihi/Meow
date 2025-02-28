import React from 'react';
import styles from './index.module.scss';
import { data } from '../mock';
import { Icon } from '../icon';

export const Card: React.FC<{ item: (typeof data)[0] }> = (props) => {
  const {
    item: { icon, name, link, desc },
  } = props;
  return (
    <a className={styles.wrap} href={link} target="_blank">
      <div className={styles.title}>
        <div className={styles.iconWrap}>
          <Icon source={icon} className={styles.icon} />
        </div>
        <div>{name}</div>
      </div>
      <p className={styles.desc}>{desc}</p>
    </a>
  );
};
