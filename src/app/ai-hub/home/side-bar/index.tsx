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
        {tools.map((tool, index) => {
          return <ListItem key={index} icon={tool.icon} text={tool.name} link={tool.link} tool={tool} />;
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
  tool?: AI_Tool;
}> = (props) => {
  const { icon, text, appendix, link, tool } = props;
  return (
    <a className={styles.itemWrap} href={link} target="_blank">
      <Icon source={icon} className={styles.icon} category1={tool?.category1} />
      <div className={styles.text}>{text}</div>
      <div className={styles.appendix}>{appendix}</div>
    </a>
  );
};
