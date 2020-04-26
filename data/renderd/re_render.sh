#!/bin/sh
PATH=$PATH:/usr/local/bin
export PATH
logfile="git/OBMcompleteness/data/renderd/log/re_render.log"
errfile="git/OBMcompleteness/data/renderd/log/re_render.ror"
exec 3>&1 4>&2
trap 'exec 2>&4 1>&3' 0 1 2 3
exec 1>> $logfile 2>>$errfile
time=$(date -u)

if [ $# -eq "0" ]; then
	echo "[ $time ] Error executing render_expired. No list." | tee -a $errfile >&3
	exit;
fi

expire_list="$1"
lines=$(cat $expire_list | wc -l)
if [ "$lines" -eq "0" ]; then
	echo "[ $time ] Warning. Nothing to render." | tee -a $errfile >&3
	exit;
fi
echo "[ $time ] rendering $lines cells." | tee -a $logfile >&3

min_zoom=0

cat $expire_list | render_expired --map=completeness --min-zoom=$min_zoom

success=$?
if [ "$success" -eq "0" ]; then
	echo "Success" $success | tee -a $logfile >&3
	truncate -s 0 $expire_list
else
	echo "[ $time ] Error executing render_expired" $success | tee -a $errfile >&3
fi
