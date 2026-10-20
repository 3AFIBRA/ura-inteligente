[general]
rtpstart = ${RTP_PORT_START}
rtpend = ${RTP_PORT_END}
icesupport = yes
stunaddr = 127.0.0.1:3478
turnaddr = 127.0.0.1:3478
turnusername = ${TURN_USER}
turnpassword = ${TURN_PASSWORD}
strictrtp = yes
rtpchecksums = yes
dtmftimeout = 3000
