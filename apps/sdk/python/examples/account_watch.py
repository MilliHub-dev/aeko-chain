import time

from aeko_sdk import AekoClient


def main() -> None:
    client = AekoClient("https://api.testnet.aeko.chain")
    account = "11111111111111111111111111111111"
    previous_balance = None

    for _ in range(3):
        balance = client.get_balance(account)
        if previous_balance is None:
            print("initial balance:", balance)
        elif balance != previous_balance:
            print("balance changed:", balance)
        else:
            print("balance unchanged:", balance)
        previous_balance = balance
        time.sleep(5)


if __name__ == "__main__":
    main()
