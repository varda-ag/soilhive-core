import { useNavigate } from 'react-router';
import { Trans, useTranslation } from 'react-i18next';

import PlusIcon from 'assets/icons/small-plus-icon.svg?react';
import { useRaster } from 'hooks/useRaster';
import { Button, Loader } from 'components/UI';
import { MapBasedFiltersTable } from 'components/AdminPortal/MapBasedFiltersTable/MapBasedFiltersTable';
import { RasterFilterDeleteModal } from 'components/AdminPortal/RasterFilterDeleteModal/RasterFilterDeleteModal';
import { useDeleteRasterFilter } from 'hooks/useDeleteRasterFilter';
import { ADMIN_PATHS } from 'configuration/admin';

import styles from './MapBasedFilters.module.scss';

const POLLING_MS = 2000;

export function MapBasedFilters() {
  const navigate = useNavigate();
  const { t } = useTranslation('admin');
  const { allCategories: allRasterCategories, isLoading, isActivationPending, setCategoryActive } = useRaster(POLLING_MS);
  const { filterToDelete, onDelete, onDeleteCancel, onDeleteConfirm } = useDeleteRasterFilter();

  return (
    <div className={styles.MapBasedFilters}>
      <section className={styles.Section}>
        <h2 className={styles.Title}>{t('filters.intro.title')}</h2>
        <p className={styles.Message}>
          <Trans
            t={t}
            i18nKey="filters.intro.description"
            components={{
              a: (
                <a
                  href="https://github.com/varda-ag/soilhive-core/blob/main/docs/map-based-filters.md"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              ),
              br: <br />,
            }}
          />
        </p>
      </section>

      <section className={styles.Section}>
        {isLoading && <Loader />}
        {!isLoading && (
          <>
            <div className={styles.Actions}>
              <Button onClick={() => navigate(`${ADMIN_PATHS.FILTERS_NEW}`)}>
                <PlusIcon /> {t('filters.list.add_button_text')}
              </Button>
            </div>
            <MapBasedFiltersTable
              filters={allRasterCategories || []}
              isActivationPending={isActivationPending}
              onEdit={id => navigate(`${ADMIN_PATHS.FILTERS_EDIT}/${id}`)}
              onDelete={onDelete}
              onSetCategoryActive={setCategoryActive}
            />
            <RasterFilterDeleteModal
              visible={!!filterToDelete}
              filterName={filterToDelete?.name}
              onContinue={onDeleteConfirm}
              onCancel={onDeleteCancel}
            />
          </>
        )}
      </section>
    </div>
  );
}
