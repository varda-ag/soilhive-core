import { useParams } from 'react-router';
import { Loader } from 'components/UI';
import { useDataset } from 'hooks/useDatasets';
import { GISDataType } from 'types/backend';
import { DefaultMappingsStep } from './DefaultMappingsStep';
import { RasterMappingsStep } from './RasterMappingsStep';

import styles from './DatasetsMappingsStep.module.scss';

export function DatasetsMappingsStep() {
  const { id } = useParams();
  const { data: dataset, isLoading } = useDataset(id);

  if (isLoading || !dataset) {
    return (
      <>
        <div className={styles.DatasetsMappingsStep}>
          <div className={styles.TablePlaceholder}>
            <Loader />
          </div>
        </div>
      </>
    );
  }

  return dataset.gis_datatype === GISDataType.RASTER ? <RasterMappingsStep id={id} /> : <DefaultMappingsStep id={id} />;
}
