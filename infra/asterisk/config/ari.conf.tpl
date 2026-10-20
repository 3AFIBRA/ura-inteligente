[general]
enabled = yes
pretty = no
allowed_origins = *
websocket_write_timeout = 100

[${ARI_USER}]
type = user
read_only = no
password = ${ARI_PASSWORD}
password_format = plain
