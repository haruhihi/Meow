'use client';

import { FloatingBubble } from 'antd-mobile';
import { ReactNode } from 'react';
import { BillEntryIcon } from '@components/action-icons';
import styles from './bill-entry-floating-button.module.scss';

type BillEntryFloatingButtonProps = {
  initialPositionBottom: string;
  background?: string;
  children?: ReactNode;
  onClick: () => void;
};

export const BillEntryFloatingButton = ({
  initialPositionBottom,
  background,
  children,
  onClick,
}: BillEntryFloatingButtonProps) => (
  <FloatingBubble
    style={{
      '--initial-position-bottom': initialPositionBottom,
      '--initial-position-right': '24px',
      '--edge-distance': '44px',
      '--background': background ?? 'var(--meow-accent-gradient)',
    }}
    onClick={onClick}
  >
    <span className={styles.iconWrap}>{children ?? <BillEntryIcon className={styles.icon} />}</span>
  </FloatingBubble>
);
