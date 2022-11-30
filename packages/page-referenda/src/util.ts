// Copyright 2017-2022 @polkadot/app-referenda authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiPromise } from '@polkadot/api';
import type { PalletConvictionVotingTally, PalletRankedCollectiveTally, PalletReferendaCurve, PalletReferendaReferendumInfoConvictionVotingTally, PalletReferendaReferendumInfoRankedCollectiveTally, PalletReferendaTrackInfo } from '@polkadot/types/lookup';
import type { BN } from '@polkadot/util';

import { getGovernanceTracks } from '@polkadot/apps-config';
import { BN_BILLION, BN_ONE, BN_ZERO, bnMax, bnMin, formatNumber, stringPascalCase } from '@polkadot/util';

export function getTrackName (trackId: BN, { name }: PalletReferendaTrackInfo): string {
  return `${
    formatNumber(trackId)
  } / ${
    name
      .replace(/_/g, ' ')
      .split(' ')
      .map(stringPascalCase)
      .join(' ')
  }`;
}

export function getTrackInfo (api: ApiPromise, specName: string, palletReferenda: string, tracks?: [BN, PalletReferendaTrackInfo][], trackId?: number): { origin: Record<string, string>, text?: string } | undefined {
  let info: { origin: Record<string, string>, text?: string } | undefined;

  if (tracks && trackId !== undefined) {
    const originMap = getGovernanceTracks(api, specName, palletReferenda);
    const trackInfo = tracks.find(([id]) => id.eqn(trackId));

    if (trackInfo && originMap) {
      const trackName = trackInfo[1].name.toString();

      info = originMap.find(({ id, name }) =>
        id === trackId &&
        name === trackName
      );
    }
  }

  return info;
}

export function isConvictionTally (tally: PalletRankedCollectiveTally | PalletConvictionVotingTally): tally is PalletConvictionVotingTally {
  return !!(tally as PalletConvictionVotingTally).support && !(tally as PalletRankedCollectiveTally).bareAyes;
}

export function isConvictionVote (info: PalletReferendaReferendumInfoConvictionVotingTally | PalletReferendaReferendumInfoRankedCollectiveTally): info is PalletReferendaReferendumInfoConvictionVotingTally {
  return info.isOngoing && isConvictionTally(info.asOngoing.tally);
}

export function curveThreshold (curve: PalletReferendaCurve, x: BN): BN {
  if (curve.isLinearDecreasing) {
    const { ceil, floor, length } = curve.asLinearDecreasing;

    // *ceil - (x.min(*length).saturating_div(*length, Down) * (*ceil - *floor))
    return ceil.sub(
      bnMin(x, length)
        .div(length)
        .mul(
          ceil.sub(floor)
        )
    );
  } else if (curve.isSteppedDecreasing) {
    const { begin, end, period, step } = curve.asSteppedDecreasing;

    // (*begin - (step.int_mul(x.int_div(*period))).min(*begin)).max(*end)
    return bnMax(
      end,
      begin.sub(
        bnMin(
          begin,
          step.mul(
            x.div(period)
          )
        )
      )
    );
  } else if (curve.asReciprocal) {
    const { factor, xOffset, yOffset } = curve.asReciprocal;

    // factor
    //   .checked_rounding_div(FixedI64::from(x) + *x_offset, Low)
    //   .map(|yp| (yp + *y_offset).into_clamped_perthing())
    //   .unwrap_or_else(Perbill::one)
    return bnMin(
      BN_BILLION,
      factor
        .div(
          x.add(xOffset)
        )
        .add(yOffset)
    );
  }

  throw new Error(`Unknown curve found ${curve.type}`);
}

export function curveDelay (curve: PalletReferendaCurve, y: BN): BN {
  if (curve.isLinearDecreasing) {
    const { ceil, floor, length } = curve.asLinearDecreasing;

    // if y < *floor {
    //   Perbill::one()
    // } else if y > *ceil {
    //   Perbill::zero()
    // } else {
    //   (*ceil - y).saturating_div(*ceil - *floor, Up).saturating_mul(*length)
    // }
    return y.lt(floor)
      ? BN_BILLION
      : y.gt(ceil)
        ? BN_ZERO
        : ceil
          .sub(y)
          .div(
            ceil.sub(floor)
          )
          .mul(length);
  } else if (curve.isSteppedDecreasing) {
    const { begin, end, period, step } = curve.asSteppedDecreasing;

    // if y < *end {
    //   Perbill::one()
    // } else {
    //   period.int_mul((*begin - y.min(*begin) + step.less_epsilon()).int_div(*step))
    // }
    return y.lt(end)
      ? BN_BILLION
      : period.mul(
        begin
          .sub(bnMin(y, begin))
          .add(
            step.isZero()
              ? step
              : step.sub(BN_ONE)
          )
          .div(step)
      );
  } else if (curve.asReciprocal) {
    const { factor, xOffset, yOffset } = curve.asReciprocal;

    // let y = FixedI64::from(y);
    // let maybe_term = factor.checked_rounding_div(y - *y_offset, High);
    // maybe_term
    //   .and_then(|term| (term - *x_offset).try_into_perthing().ok())
    //   .unwrap_or_else(Perbill::one)
    return bnMin(
      BN_BILLION,
      factor
        .div(
          y.sub(yOffset)
        )
        .sub(xOffset)
    );
  }

  throw new Error(`Unknown curve found ${curve.type}`);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function calcDecidingEnd (totalIssuance: BN, tally: PalletRankedCollectiveTally | PalletConvictionVotingTally, { minApproval, minSupport }: PalletReferendaTrackInfo): BN | undefined {
  return undefined;
}
