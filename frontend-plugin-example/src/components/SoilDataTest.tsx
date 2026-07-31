import type { PluginContext } from "frontend-plugin-types"

export function SoilDataTest({ pluginContext }: { pluginContext: PluginContext }){

    const res1 = pluginContext.useSoilData({filterId: '019fb88d-ca7e-7e18-a675-ac85c1e309bc', availableDatasets: ["lucas-2018"], limit: 10})
    

    const res2 = pluginContext.useSoilData({filterId: '019fb899-a316-796b-8cfe-27701a8e3812', availableDatasets: ["lucas-2015"], limit: 5})

    return (
        <>
            <h3>Soild Data</h3>
            <div>Res 1: {res1.data.map(v => v.value).join(', ')} <button onClick={() => res1.loadMore()}>Next</button></div>
            <div>Res 2: {res2.data.map(v => v.value).join(', ')} <button onClick={() => res2.loadMore()}>Next</button></div>
            <br />
        </>
    )
}