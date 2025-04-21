import Article from '@static/article.svg';
import Essay from '@static/essay.svg';
import Email from '@static/email.svg';
import MarketReport from '@static/market-report.svg';
import WeeklyReport from '@static/weekly-report.svg';
import Proposal from '@static/proposal.svg';
import Resume from '@static/resume.svg';
import SocialPost from '@static/social-post.svg';
import Poem from '@static/poem.svg';
import Story from '@static/story.svg';
import Novel from '@static/novel.svg';
import Script from '@static/script.svg';
import Code from '@static/code.svg';
import Questionnaire from '@static/questionnaire.svg';
import { IDict } from './dictionaries';

export const getTypeConfigs = (dict: IDict) => {
  return [
    {
      key: 'Article',
      label: dict.words['Article'],
      icon: <Article width="16px" height="16px" />,
      desc: dict.words['Write articles'],
    },
    {
      key: 'Essay',
      label: dict.words['Essay'],
      icon: <Essay width="16px" height="16px" />,
      desc: dict.words['Compose essays'],
    },
    {
      key: 'Email',
      label: dict.words['Email'],
      icon: <Email width="16px" height="16px" />,
      desc: dict.words['Draft emails'],
    },
    {
      key: 'Social post',
      label: dict.words['Social post'],
      icon: <SocialPost width="16px" height="16px" />,
      desc: dict.words['Create social posts'],
    },
    {
      key: 'Poem',
      label: dict.words['Poem'],
      icon: <Poem width="16px" height="16px" />,
      desc: dict.words['Write poems'],
    },
    {
      key: 'Market report',
      label: dict.words['Market report'],
      icon: <MarketReport width="16px" height="16px" />,
      desc: dict.words['Generate market reports'],
    },
    {
      key: 'Weekly report',
      label: dict.words['Weekly report'],
      icon: <WeeklyReport width="16px" height="16px" />,
      desc: dict.words['Create weekly reports'],
    },
    {
      key: 'Proposal',
      label: dict.words['Proposal'],
      icon: <Proposal width="16px" height="16px" />,
      desc: dict.words['Write proposals'],
    },
    {
      key: 'Resume',
      label: dict.words['Resume'],
      icon: <Resume width="16px" height="16px" />,
      desc: dict.words['Build resumes'],
    },
    {
      key: 'Story',
      label: dict.words['Story'],
      icon: <Story width="16px" height="16px" />,
      desc: dict.words['Compose stories'],
    },
    {
      key: 'Novel',
      label: dict.words['Novel'],
      icon: <Novel width="16px" height="16px" />,
      desc: dict.words['Write novels'],
    },
    {
      key: 'Script',
      label: dict.words['Script'],
      icon: <Script width="16px" height="16px" />,
      desc: dict.words['Create scripts'],
    },
    {
      key: 'Code',
      label: dict.words['Code'],
      icon: <Code width="16px" height="16px" />,
      desc: dict.words['Generate code'],
      type: 'coding',
    },
    {
      key: 'Questionnaire',
      label: dict.words['Questionnaire'],
      icon: <Questionnaire width="16px" height="16px" />,
      desc: dict.words['Create questionnaires'],
    },
    {
      key: 'Essay2',
      label: dict.words['Essay'],
      icon: <Essay width="16px" height="16px" />,
      desc: dict.words['Compose essays'],
    },
  ];
};
