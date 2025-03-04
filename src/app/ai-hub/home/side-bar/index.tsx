import Tool from '@static/tool.svg';
import React from 'react';
import styles from './index.module.scss';
import { UpOutlined } from '@ant-design/icons';
import { Icon } from '../icon';
import { AI_Tool } from '@prisma/client';

export const SideBar: React.FC<{ tools: AI_Tool[] }> = (props) => {
  const { tools } = props;
  return (
    <div className={styles.sideBarWrap}>
      <ListItem icon={<Tool width="16px" height="16px" />} text="All Tools" appendix={tools.length} />
      <div className={styles.label}>
        Popular Tools <UpOutlined width={16} height={16} />
      </div>
      <div>
        {tools.map((item, index) => {
          return <ListItem key={index} icon={item.icon} text={item.name} link={item.link} />;
        })}
      </div>
    </div>
  );
};

const ListItem: React.FC<{
  icon: React.ReactNode | string;
  text: string;
  appendix?: React.ReactNode;
  link?: string;
}> = (props) => {
  const { icon, text, appendix, link } = props;
  return (
    <a className={styles.itemWrap} href={link} target="_blank">
      <Icon source={icon} className={styles.icon} />
      <div className={styles.text}>{text}</div>
      <div className={styles.appendix}>{appendix}</div>
    </a>
  );
};
