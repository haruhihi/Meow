import React from 'react';

export const Icon: React.FC<{ source: string | React.ReactNode; size?: string; className?: string }> = (props) => {
  const { source, className } = props;
  const result =
    typeof source === 'string' ? (
      <div className={className} dangerouslySetInnerHTML={{ __html: source }} />
    ) : (
      <div className={className}>{source}</div>
    );
  return result;
};
