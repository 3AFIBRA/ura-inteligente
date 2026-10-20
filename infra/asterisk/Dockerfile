FROM debian:bookworm-slim AS build

ARG ASTERISK_VERSION=20.9.3
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential wget ca-certificates curl subversion git \
    libssl-dev libncurses5-dev libnewt-dev libxml2-dev libsqlite3-dev uuid-dev \
    libjansson-dev libedit-dev libsrtp2-dev libopus-dev libopusfile-dev libspandsp-dev \
    libcurl4-openssl-dev libgsm1-dev libspeex-dev libspeexdsp-dev libogg-dev libvorbis-dev \
    libresample1-dev libsndfile1-dev pkg-config python3 xmlstarlet bzip2 patch file \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src
RUN wget -q https://downloads.asterisk.org/pub/telephony/asterisk/releases/asterisk-${ASTERISK_VERSION}.tar.gz \
 && tar xzf asterisk-${ASTERISK_VERSION}.tar.gz && rm asterisk-${ASTERISK_VERSION}.tar.gz \
 && mv asterisk-${ASTERISK_VERSION} asterisk

WORKDIR /usr/src/asterisk
RUN contrib/scripts/get_mp3_source.sh || true \
 && ./configure --with-pjproject-bundled --with-jansson-bundled --with-ssl --with-srtp --with-opus \
 && make menuselect.makeopts \
 && menuselect/menuselect \
      --enable res_ari --enable res_ari_channels --enable res_ari_bridges --enable res_ari_playbacks \
      --enable res_ari_recordings --enable res_ari_endpoints --enable res_ari_events --enable res_ari_applications \
      --enable res_ari_sounds --enable res_ari_asterisk --enable res_ari_device_states \
      --enable res_stasis --enable res_stasis_answer --enable res_stasis_playback --enable res_stasis_recording \
      --enable res_stasis_snoop --enable res_stasis_device_state \
      --enable res_pjsip --enable res_pjsip_transport_websocket --enable res_http_websocket \
      --enable res_srtp --enable res_rtp_asterisk --enable chan_pjsip \
      --enable codec_opus --enable codec_gsm --enable codec_alaw --enable codec_ulaw --enable codec_g722 \
      --enable format_wav --enable format_pcm --enable format_gsm --enable format_sln --enable format_mp3 \
      --enable app_queue --enable app_mixmonitor --enable app_chanspy --enable app_voicemail \
      --enable app_dial --enable app_playback --enable app_read --enable app_stasis --enable app_confbridge \
      --enable res_musiconhold --enable res_agi --enable res_speech --enable res_timing_timerfd \
      --enable func_cdr --enable cdr_csv --enable cdr_custom --enable cel_custom \
      --enable res_crypto --enable res_pjsip_outbound_registration --enable res_pjsip_nat \
      --disable BUILD_NATIVE \
      --enable CORE-SOUNDS-EN-GSM --enable CORE-SOUNDS-EN-WAV --enable MOH-OPSOUND-WAV \
      --enable EXTRA-SOUNDS-EN-GSM \
      menuselect.makeopts \
 && make -j"$(nproc)" \
 && make install \
 && make samples \
 && make basic-pbx || true

# ---------------- runtime ----------------
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
    libssl3 libncurses6 libnewt0.52 libxml2 libsqlite3-0 libuuid1 libjansson4 libedit2 \
    libsrtp2-1 libopus0 libopusfile0 libspandsp2 libcurl4 libgsm1 libspeex1 libspeexdsp1 \
    libogg0 libvorbis0a libvorbisenc2 libresample1 libsndfile1 ca-certificates sox libsox-fmt-all \
    ffmpeg gettext-base tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r asterisk && useradd -r -g asterisk -d /var/lib/asterisk -s /sbin/nologin asterisk

COPY --from=build /usr/lib/asterisk /usr/lib/asterisk
COPY --from=build /usr/lib/libasteriskssl* /usr/lib/
COPY --from=build /usr/lib/libasteriskpj* /usr/lib/
COPY --from=build /usr/sbin/asterisk /usr/sbin/asterisk
COPY --from=build /var/lib/asterisk /var/lib/asterisk
COPY --from=build /var/spool/asterisk /var/spool/asterisk
COPY --from=build /etc/asterisk /etc/asterisk.sample

COPY config/ /etc/asterisk/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
 && mkdir -p /etc/asterisk/tenants /etc/asterisk/keys /var/lib/asterisk/sounds/custom /var/spool/asterisk/monitor /var/log/asterisk /var/run/asterisk \
 && touch /etc/asterisk/tenants/pjsip-all.conf /etc/asterisk/tenants/extensions-all.conf /etc/asterisk/tenants/queues-all.conf \
 && chown -R asterisk:asterisk /etc/asterisk /var/lib/asterisk /var/spool/asterisk /var/log/asterisk /var/run/asterisk

EXPOSE 5060/udp 5060/tcp 5061/tcp 8088/tcp 8089/tcp 5038/tcp
ENTRYPOINT ["/entrypoint.sh"]
CMD ["asterisk", "-f", "-U", "asterisk", "-G", "asterisk", "-vvv"]
