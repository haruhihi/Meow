import React from 'react';

export const Icon: React.FC<{ source: string | React.ReactNode; size?: string; className?: string }> = (props) => {
  const { source, className } = props;
  // console.log(typeof source === 'string' ? source.replace(/(<svg\b[^>]*?)\swidth="\d+"\s?/i, '$1') : '-');
  const result =
    typeof source === 'string' ? (
      <div
        className={className}
        dangerouslySetInnerHTML={{
          __html: source
            .replace(/(<svg\b[^>]*?)\s?width="\d+"\s?/i, '$1')
            .replace(/(<svg\b[^>]*?)\s?height="\d+"/i, '$1'),
        }}
      />
    ) : (
      <div className={className}>{source}</div>
    );
  return result;
};
