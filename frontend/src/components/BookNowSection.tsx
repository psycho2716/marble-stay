"use client";

import { useState } from "react";
import { BookingModal, type HotelPaymentInfo } from "./BookingModal";

type BookNowSectionProps = {
  roomId: string;
  roomName: string;
  basePriceNight: string;
  hotel: HotelPaymentInfo & { id: string; name: string; address: string };
  offerHourly?: boolean;
  hourlyRate?: string | null;
};

export function BookNowSection({ roomId, roomName, basePriceNight, hotel, offerHourly, hourlyRate }: BookNowSectionProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="mt-8">
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="inline-block rounded-lg bg-primary-600 px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Book now
        </button>
      </div>
      {modalOpen && (
        <BookingModal
          roomId={roomId}
          roomName={roomName}
          basePriceNight={basePriceNight}
          hotel={hotel}
          offerHourly={offerHourly}
          hourlyRate={hourlyRate ?? undefined}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
