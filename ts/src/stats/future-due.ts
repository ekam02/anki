// Copyright: Ankitects Pty Ltd and contributors
// License: GNU AGPL, version 3 or later; http://www.gnu.org/licenses/agpl.html

/* eslint
@typescript-eslint/no-non-null-assertion: "off",
@typescript-eslint/no-explicit-any: "off",
 */

import pb from "../backend/proto";
import { extent, histogram, rollup, sum, Bin } from "d3-array";
import { scaleLinear, scaleSequential } from "d3-scale";
import { CardQueue } from "../cards";
import { HistogramData } from "./histogram-graph";
import { interpolateGreens } from "d3-scale-chromatic";
import { dayLabel } from "../time";
import { I18n } from "../i18n";

export interface GraphData {
    dueCounts: Map<number, number>;
}

export enum FutureDueRange {
    Month = 0,
    Quarter = 1,
    Year = 2,
    AllTime = 3,
}

export function gatherData(data: pb.BackendProto.GraphsOut): GraphData {
    const due = (data.cards as pb.BackendProto.Card[])
        .filter((c) => c.queue == CardQueue.Review) // && c.due >= data.daysElapsed)
        .map((c) => c.due - data.daysElapsed);
    const dueCounts = rollup(
        due,
        (v) => v.length,
        (d) => d
    );
    return { dueCounts };
}

function binValue(d: Bin<Map<number, number>, number>): number {
    return sum(d, (d) => d[1]);
}

export function buildHistogram(
    sourceData: GraphData,
    range: FutureDueRange,
    backlog: boolean,
    i18n: I18n
): HistogramData | null {
    // get min/max
    const data = sourceData.dueCounts;
    if (!data) {
        return null;
    }

    const [xMinOrig, origXMax] = extent<number>(data.keys());
    let xMin = xMinOrig;
    if (!backlog) {
        xMin = 0;
    }
    let xMax = origXMax;

    // cap max to selected range
    switch (range) {
        case FutureDueRange.Month:
            xMax = 31;
            break;
        case FutureDueRange.Quarter:
            xMax = 90;
            break;
        case FutureDueRange.Year:
            xMax = 365;
            break;
        case FutureDueRange.AllTime:
            break;
    }
    xMax = xMax! + 1;

    // cap bars to available range
    const desiredBars = Math.min(70, xMax! - xMin!);

    const x = scaleLinear().domain([xMin!, xMax!]).nice();
    const bins = histogram()
        .value((m) => {
            return m[0];
        })
        .domain(x.domain() as any)
        .thresholds(x.ticks(desiredBars))(data.entries() as any);

    // empty graph?
    if (!sum(bins, (bin) => bin.length)) {
        return null;
    }

    const adjustedRange = scaleLinear().range([0.8, 0.3]);
    const colourScale = scaleSequential((n) =>
        interpolateGreens(adjustedRange(n))
    ).domain([xMin!, xMax]);

    const total = sum(bins as any, binValue);

    function hoverText(
        data: HistogramData,
        binIdx: number,
        cumulative: number,
        _percent: number
    ): string {
        const bin = data.bins[binIdx];
        const days = dayLabel(i18n, bin.x0!, bin.x1!);
        const cards = i18n.tr(i18n.TR.STATISTICS_CARDS_DUE, {
            cards: binValue(data.bins[binIdx] as any),
        });
        const totalLabel = i18n.tr(i18n.TR.STATISTICS_RUNNING_TOTAL);

        return `${days}:<br>${cards}<br>${totalLabel}: ${cumulative}`;
    }

    return {
        scale: x,
        bins,
        total,
        hoverText,
        showArea: true,
        colourScale,
        binValue,
    };
}
