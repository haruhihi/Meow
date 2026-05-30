import styles from './loading.module.scss';

type LoadingProps = {
  label?: string;
  compact?: boolean;
  full?: boolean;
  className?: string;
};

export const LoadingOrb = () => <span className={styles.orb} aria-hidden="true" />;

export const InlineLoading = ({ label = '加载中' }: Pick<LoadingProps, 'label'>) => (
  <span className={styles.inline} role="status" aria-live="polite">
    <LoadingOrb />
    <span className={styles.label}>{label}</span>
  </span>
);

export const LoadingState = ({ label = '加载中', compact = false, full = false, className = '' }: LoadingProps) => (
  <div className={[styles.state, compact ? styles.compact : '', full ? styles.full : '', className].filter(Boolean).join(' ')} role="status" aria-live="polite">
    <LoadingOrb />
    <span className={styles.label}>{label}</span>
  </div>
);

export const TopLoading = () => <LoadingState label="加载中" full />;
