import { useTranslation } from 'react-i18next';
import Skeleton from 'react-loading-skeleton';

import { htmlDisplay } from '../../utilities/html-display';
import LinkedinIcon from 'assets/icons/linkedin-icon.svg?react';
import YoutubeIcon from 'assets/icons/youtube-icon.svg?react';

import styles from './LegalPageTemplate.module.scss';

interface Props {
  htmlContent: string;
  title: string;
  bannerImage: string;
  latestUpdate?: string;
  isLoading?: boolean;
}

export default function LegalPageTemplate({ htmlContent, title, bannerImage, latestUpdate, isLoading }: Props) {
  const { t } = useTranslation('common');

  if (isLoading) {
    return <Skeleton></Skeleton>;
  }

  return (
    <div className={styles.Layout}>
      <div className={styles.Banner}>
        <div className={styles.Left}>
          <h1 className={styles.Title}>{title}</h1>
          {!!latestUpdate && <p className={styles.LatestUpdate}>{t('legal_page.latest_update', { date: latestUpdate })}</p>}
        </div>
        <img src={bannerImage} className={styles.BannerImage} />
      </div>

      <main className={styles.Main}>
        <article className={styles.Content}>{htmlDisplay(htmlContent)}</article>
        <aside className={styles.Sidebar}></aside>
      </main>

      <footer className={styles.Footer}>
        <div className={styles.Links}>
          <a href="https://www.varda.ag/" className={styles.Link} target="_blank" rel="noreferrer">
            {t('legal_page.footer_website_text')}
          </a>
          <a href="https://www.varda.ag/#contact" className={styles.Link} target="_blank" rel="noreferrer">
            {t('legal_page.footer_contact_text')}
          </a>
        </div>
        <div className={styles.Bottom}>
          <p className={styles.Copy}>{t('legal_page.footer_copy')}</p>
          <div className={styles.Social}>
            <a href="https://www.linkedin.com/company/varda-field-data-exchange/" target="_blank" rel="noreferrer">
              <LinkedinIcon />
            </a>
            <a href="https://www.youtube.com/channel/UCFx4LohqvmBJHyIYChBiong" target="_blank" rel="noreferrer">
              <YoutubeIcon />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
