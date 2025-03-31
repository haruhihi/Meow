import React from 'react';
import { items } from '../side-bar/config';
import Tool from '@static/tool.svg';
import { upperCase } from 'lodash-es';

export const Icon: React.FC<{
  source: string | React.ReactNode;
  size?: string;
  className?: string;
  category1?: string;
}> = (props) => {
  const { source, className, category1 } = props;
  const defaultIcon = items.find((item) => upperCase(item.key) === upperCase(category1))?.icon ?? <Tool />;

  const isEnableDefaultSvg = global?.location?.href?.indexOf('endfticon') > -1;
  console.log('isEnableDefaultSvg', category1, isEnableDefaultSvg, source);
  const result =
    typeof source === 'string' && source !== '' ? (
      <div
        className={className}
        dangerouslySetInnerHTML={{
          __html: source.replace(/\s*(width|height)="\d+"/g, ''),
        }}
      />
    ) : isEnableDefaultSvg && !source ? (
      defaultIcon
    ) : (
      <div className={className}>{source}</div>
    );
  return result;
};
